const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const AgentMemoryManager = require('../managers/AgentMemoryManager');

class ClaudeChannelsHandler {
  constructor() {
    this.authenticated = false;
    this.memoryManager = new AgentMemoryManager();
    this.checkAuth();
  }

  // Claude Code kontrolü - komut çalışıyor mu?
  async checkAuth() {
    return new Promise((resolve) => {
      const testProcess = spawn('claude', ['--version'], {
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';

      testProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      testProcess.on('close', (code) => {
        if (code === 0 && output.includes('Claude Code')) {
          this.authenticated = true;
          console.log('✅ Claude Code hazır:', output.trim());
        } else {
          this.authenticated = false;
          console.log('❌ Claude Code bulunamadı');
        }
        resolve();
      });

      testProcess.on('error', () => {
        this.authenticated = false;
        console.log('❌ Claude Code CLI yüklü değil');
        resolve();
      });
    });
  }

  hasAuth() {
    return this.authenticated;
  }

  // PM görevi için Claude Code çalıştır
  async processPMTask(taskRequest, workspaces, agents, personality = 'sert') {
    if (!this.authenticated) {
      throw new Error('Claude Code ile giriş yapılmamış! Terminal: claude login');
    }

    const workspace = workspaces.find(w => w.name === taskRequest.workspaceName);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const idleAgents = agents.filter(a => a.status === 'idle');
    if (idleAgents.length === 0) {
      throw new Error('Hiç boşta agent yok!');
    }

    // PM kişiliği belirleme
    let personalityPrompt = '';
    if (personality === 'sert') {
      personalityPrompt = 'Sen bir Product Manager\'sın (PM). Sert ama adil konuşursun. Argo kullanabilirsin, direkt ve net konuş.';
    } else if (personality === 'nazik') {
      personalityPrompt = 'Sen bir Product Manager\'sın (PM). Nazik, profesyonel ve motive edici konuşursun. Takım çalışmasına önem verirsin.';
    } else if (personality === 'komik') {
      personalityPrompt = 'Sen bir Product Manager\'sın (PM). Esprili, şakacı ama işini ciddiye alan birisin. Mesajlarına mizah katarsın.';
    }

    const prompt = `${personalityPrompt}

WORKSPACE: ${workspace.name} (${workspace.path})

BOŞTA OLAN AGENTLAR:
${idleAgents.map(a => `- ID: ${a.id}, İsim: ${a.name}, Rol: ${a.role}`).join('\n')}

PATRON GÖREVI: "${taskRequest.task}"

GÖREVIN:
1. Hangi agentları kullanacağına karar ver
2. Her agent için spesifik alt görev tanımla (ÖNEMLİ: Agent'lar GERÇEKTEN KOD YAZACAK, sadece analiz değil!)
3. PM mesajlarını yaz (sert konuşabilirsin, argo kullan)

DİKKAT: Agent'lar WORKSPACE'teki dosyalara GERÇEKTEN KOD YAZACAK, değişiklik yapacak!
ÖNEMLİ: Cevabın SADECE ve SADECE JSON olmalı! Başka hiçbir şey yazma!

JSON FORMAT:
{
  "selectedAgents": [
    {"agentId": "agent-id", "agentName": "isim", "subTask": "ne yapacak"}
  ],
  "pmMessages": [
    {"to": "agent-name", "message": "Sert PM mesajı"}
  ],
  "summary": "Patron'a özet"
}

Eğer görev belirsizse:
{
  "needsInfo": true,
  "question": "Patron'a soracağın soru",
  "selectedAgents": [],
  "pmMessages": [],
  "summary": "Bilgi gerekiyor"
}

TEKRAR: SADECE JSON yaz, başka hiçbir şey yazma!`;

    try {
      const response = await this.runClaudeCommand(prompt, workspace.path);

      // JSON parse et
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Claude response is not JSON: ' + response.substring(0, 200));
      }
    } catch (error) {
      throw new Error('Claude Code Error: ' + error.message);
    }
  }

  // Agent çalıştır
  async runAgent(agentConfig, task, workspace) {
    if (!this.authenticated) {
      throw new Error('Claude Code ile giriş yapılmamış!');
    }

    // Agent hafızasını yükle (hem global hem project)
    const memoryData = this.memoryManager.getCombinedAgentMemory(
      workspace.path,
      agentConfig.id,
      agentConfig.name
    );

    const workspaceContext = this.memoryManager.getWorkspaceContext(workspace.path);

    const prompt = `Sen bir ${agentConfig.role} agent'sın. İsmin: ${agentConfig.name}.

WORKSPACE: ${workspace.name} (${workspace.path})

PM sana görev verdi: ${task}

${workspaceContext ? `\n📋 WORKSPACE CONTEXT (Proje Bilgisi):\n${workspaceContext}\n` : ''}

${memoryData.combined ? `\n🧠 HAFIZAM:\n${memoryData.combined}\n` : ''}

ÖNEMLİ TALİMATLAR:
1. Bu workspace'deki dosyaları OKU (Read tool kullan)
2. Gerekli değişiklikleri GERÇEKTEN YAP (Edit/Write tool kullan)
3. Yeni dosya gerekiyorsa OLUŞTUR (Write tool kullan)
4. Test et, çalıştığından emin ol
5. Sonunda kısa rapor ver: Ne yaptın, hangi dosyaları değiştirdin

SADECE RAPOR YAZMA! GERÇEKTEN KOD YAZ, DOSYALARI DEĞİŞTİR!

Görevi tamamla:`;

    try {
      return await this.runClaudeCommand(prompt, workspace.path);
    } catch (error) {
      throw new Error('Agent Error: ' + error.message);
    }
  }

  // Claude Code komutunu çalıştır
  runClaudeCommand(prompt, workingDir) {
    return new Promise((resolve, reject) => {
      // --dangerously-skip-permissions = Tüm izin kontrollerini atla
      // Bu workspace izole olduğu için güvenli
      const claudeProcess = spawn('claude', [
        '--print',
        '--model', 'opus',
        '--dangerously-skip-permissions'
      ], {
        cwd: workingDir,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      let errorOutput = '';

      claudeProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      claudeProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      claudeProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Claude exited with code ${code}: ${errorOutput}`));
        } else {
          resolve(output.trim());
        }
      });

      claudeProcess.on('error', (error) => {
        reject(new Error(`Failed to start Claude: ${error.message}`));
      });

      // Prompt'u stdin'e yaz
      claudeProcess.stdin.write(prompt);
      claudeProcess.stdin.end();
    });
  }
}

module.exports = ClaudeChannelsHandler;
