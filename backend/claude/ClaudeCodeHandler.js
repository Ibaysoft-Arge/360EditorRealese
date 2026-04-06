const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class ClaudeCodeHandler {
  constructor() {
    this.isAuthenticated = false;
    this.checkAuth();
  }

  // Claude Code auth kontrolü
  async checkAuth() {
    return new Promise((resolve) => {
      // Basit test: "claude --version" çalışıyorsa auth var demektir
      const claude = spawn('claude', ['--version'], {
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let hasOutput = false;

      claude.stdout.on('data', (data) => {
        if (data.toString().includes('Claude Code')) {
          hasOutput = true;
        }
      });

      claude.on('close', (code) => {
        // Exit code 0 ve output varsa = authenticated
        this.isAuthenticated = (code === 0 && hasOutput);
        console.log(this.isAuthenticated ? '✅ Auth başarılı' : '❌ Auth başarısız');
        resolve(this.isAuthenticated);
      });

      // Timeout
      setTimeout(() => {
        claude.kill();
        this.isAuthenticated = false;
        resolve(false);
      }, 3000);
    });
  }

  hasAuth() {
    return this.isAuthenticated;
  }

  // Claude Code ile PM görevi işle
  async processPMTask(taskRequest, workspaces, agents) {
    return new Promise((resolve, reject) => {
      const workspace = workspaces.find(w => w.name === taskRequest.workspaceName);

      if (!workspace) {
        reject(new Error('Workspace not found'));
        return;
      }

      const idleAgents = agents.filter(a => a.status === 'idle');

      if (idleAgents.length === 0) {
        reject(new Error('Hiç boşta agent yok! Önce agentları serbest bırakın.'));
        return;
      }

      // PM prompt - SADECE JSON!
      const prompt = `You are a JSON generator. Output ONLY valid JSON, nothing else.

Task: "${taskRequest.task}"
Workspace: ${workspace.name}
Available agents:
${idleAgents.map(a => `{id:"${a.id}",name:"${a.name}",role:"${a.role}"}`).join('\n')}

Return this exact JSON structure (fill in the values):
{
  "selectedAgents": [
    {"agentId": "${idleAgents[0]?.id || 'id'}", "agentName": "${idleAgents[0]?.name || 'name'}", "subTask": "what this agent will do"}
  ],
  "pmMessages": [
    {"to": "${idleAgents[0]?.name || 'name'}", "message": "PM message here"}
  ],
  "summary": "brief summary"
}

OUTPUT (JSON only):`;

      let output = '';
      let errorOutput = '';

      // Claude Code subprocess
      const claude = spawn('claude', [
        '--print',
        '--model', 'opus',
        prompt
      ], {
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      claude.stdout.on('data', (data) => {
        output += data.toString();
      });

      claude.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.error('Claude stderr:', data.toString());
      });

      claude.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Claude process exited with code ${code}. Error: ${errorOutput}`));
          return;
        }

        try {
          // JSON çıktısını parse et
          const jsonMatch = output.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            resolve(result);
          } else {
            reject(new Error('PM response format error. Output: ' + output.substring(0, 200)));
          }
        } catch (error) {
          reject(new Error(`Parse error: ${error.message}`));
        }
      });
    });
  }

  // Agent çalıştır
  async runAgent(agentConfig, task, workspace) {
    return new Promise((resolve, reject) => {
      const prompt = `Sen bir ${agentConfig.role} agent'sın. İsmin: ${agentConfig.name}.

PM sana görev verdi: ${task}

WORKSPACE: ${workspace.name} (${workspace.path})

Görevi analiz et ve detaylı rapor ver. Kod örnekleri sun.`;

      let output = '';
      let errorOutput = '';

      const claude = spawn('claude', ['--print', prompt], {
        shell: true,
        cwd: workspace.path, // Workspace dizininde çalış
        stdio: ['ignore', 'pipe', 'pipe']
      });

      claude.stdout.on('data', (data) => {
        output += data.toString();
      });

      claude.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.error('Agent stderr:', data.toString());
      });

      claude.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Agent process exited with code ${code}. Error: ${errorOutput}`));
          return;
        }

        resolve(output.trim());
      });
    });
  }

  // Test komutu - Claude Code çalışıyor mu?
  async testClaudeCode() {
    return new Promise((resolve) => {
      const claude = spawn('claude', ['--version'], {
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';

      claude.stdout.on('data', (data) => {
        output += data.toString();
      });

      claude.on('close', (code) => {
        if (code === 0 && output) {
          resolve({ success: true, version: output.trim() });
        } else {
          resolve({
            success: false,
            error: 'Claude Code CLI bulunamadı. Lütfen yükleyin.'
          });
        }
      });
    });
  }
}

module.exports = ClaudeCodeHandler;
