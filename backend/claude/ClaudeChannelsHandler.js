const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Anthropic = require('@anthropic-ai/sdk');
const AgentMemoryManager = require('../managers/AgentMemoryManager');

class ClaudeChannelsHandler {
  constructor(io = null) {
    this.io = io;
    this.authenticated = false;
    this.memoryManager = new AgentMemoryManager();

    // Claude CLI path'ini belirle
    const homeDir = os.homedir();
    this.claudePath = path.join(homeDir, '.local', 'bin', 'claude.exe');

    // Model seçimi (default: sonnet - hızlı ve dengeli)
    this.currentModel = 'sonnet';

    // Anthropic SDK (direkt API kullanımı için)
    this.anthropic = null;
    this.useDirectAPI = false;
    this.initializeAnthropicSDK();

    // Usage tracking (geliştirilmiş)
    this.totalTokensUsed = 0;
    this.totalRequests = 0;
    this.usageHistory = [];
    this.currentTaskTokens = {}; // Task bazlı token tracking

    this.checkAuth();
  }

  // Anthropic SDK'yı başlat
  initializeAnthropicSDK() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey && apiKey.startsWith('sk-ant-')) {
      this.anthropic = new Anthropic({
        apiKey: apiKey
      });
      this.useDirectAPI = true;
      console.log('✅ Anthropic SDK hazır (Direkt API kullanımı)');
    } else {
      this.useDirectAPI = false;
      console.log('✅ Claude CLI kullanılacak (Token tracking kapalı)');
    }
  }

  // Model değiştir
  setModel(model) {
    const validModels = ['opus', 'sonnet', 'haiku'];
    if (validModels.includes(model)) {
      this.currentModel = model;
      console.log(`🤖 Claude model değiştirildi: ${model}`);
      return true;
    }
    return false;
  }

  // Claude Code kontrolü - komut çalışıyor mu?
  async checkAuth() {
    return new Promise((resolve) => {
      const testProcess = spawn(this.claudePath, ['--version'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
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
  async processPMTask(taskRequest, workspaces, agents, personality = 'sert', taskId = null) {
    if (!this.authenticated && !this.useDirectAPI) {
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
      const response = await this.runClaudeCommand(prompt, workspace.path, 'pm', taskId);

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
  async runAgent(agentConfig, task, workspace, taskId = null) {
    if (!this.authenticated && !this.useDirectAPI) {
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
      return await this.runClaudeCommand(prompt, workspace.path, agentConfig.id, taskId);
    } catch (error) {
      throw new Error('Agent Error: ' + error.message);
    }
  }

  // Claude Code komutunu çalıştır (Direkt API veya CLI)
  async runClaudeCommand(prompt, workingDir, agentId = null, taskId = null) {
    // Direkt API kullanımı varsa
    if (this.useDirectAPI && this.anthropic) {
      return await this.runDirectAPI(prompt, agentId, taskId);
    }

    // Claude CLI kullanımı (fallback)
    return new Promise((resolve, reject) => {
      console.log(`🤖 Claude CLI çalıştırılıyor (Model: ${this.currentModel})`);

      const claudeProcess = spawn(this.claudePath, [
        '--print',
        '--model', this.currentModel,
        '--dangerously-skip-permissions'
      ], {
        cwd: workingDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
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

      claudeProcess.stdin.write(prompt);
      claudeProcess.stdin.end();
    });
  }

  // Direkt Anthropic API kullanımı (Token tracking ile)
  async runDirectAPI(prompt, agentId = null, taskId = null) {
    try {
      const startTime = Date.now();

      // Model mapping
      const modelMap = {
        'opus': 'claude-opus-4-20250514',
        'sonnet': 'claude-sonnet-4-20250514',
        'haiku': 'claude-haiku-4-20250228'
      };

      const model = modelMap[this.currentModel] || 'claude-sonnet-4-20250514';

      console.log(`🤖 Claude API çağrısı (Model: ${model})`);

      const response = await this.anthropic.messages.create({
        model: model,
        max_tokens: 8096,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const duration = Date.now() - startTime;

      // Token kullanımı
      const usage = {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_creation_tokens: response.usage.cache_creation_input_tokens || 0,
        cache_read_tokens: response.usage.cache_read_input_tokens || 0,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens,
        duration_ms: duration,
        model: model,
        timestamp: new Date().toISOString()
      };

      // Global tracking
      this.totalTokensUsed += usage.total_tokens;
      this.totalRequests++;
      this.usageHistory.push(usage);

      // Task bazlı tracking
      if (taskId) {
        if (!this.currentTaskTokens[taskId]) {
          this.currentTaskTokens[taskId] = {
            total_input: 0,
            total_output: 0,
            total_cache_creation: 0,
            total_cache_read: 0,
            total: 0,
            requests: 0,
            agents: {}
          };
        }

        this.currentTaskTokens[taskId].total_input += usage.input_tokens;
        this.currentTaskTokens[taskId].total_output += usage.output_tokens;
        this.currentTaskTokens[taskId].total_cache_creation += usage.cache_creation_tokens;
        this.currentTaskTokens[taskId].total_cache_read += usage.cache_read_tokens;
        this.currentTaskTokens[taskId].total += usage.total_tokens;
        this.currentTaskTokens[taskId].requests++;

        // Agent bazlı tracking
        if (agentId) {
          if (!this.currentTaskTokens[taskId].agents[agentId]) {
            this.currentTaskTokens[taskId].agents[agentId] = {
              input: 0,
              output: 0,
              total: 0,
              requests: 0
            };
          }

          this.currentTaskTokens[taskId].agents[agentId].input += usage.input_tokens;
          this.currentTaskTokens[taskId].agents[agentId].output += usage.output_tokens;
          this.currentTaskTokens[taskId].agents[agentId].total += usage.total_tokens;
          this.currentTaskTokens[taskId].agents[agentId].requests++;
        }
      }

      // Frontend'e token kullanımını bildir
      if (this.io) {
        this.io.emit('token:usage', {
          taskId,
          agentId,
          usage,
          taskTotals: taskId ? this.currentTaskTokens[taskId] : null,
          globalTotals: {
            total: this.totalTokensUsed,
            requests: this.totalRequests
          }
        });
      }

      console.log(`✅ Token kullanımı: ${usage.total_tokens} (in: ${usage.input_tokens}, out: ${usage.output_tokens})`);

      // Response'u text olarak döndür
      return response.content[0].text;

    } catch (error) {
      console.error('❌ Anthropic API hatası:', error.message);
      throw new Error(`Anthropic API Error: ${error.message}`);
    }
  }

  // Task token bilgilerini al
  getTaskTokens(taskId) {
    return this.currentTaskTokens[taskId] || null;
  }

  // Task token bilgilerini temizle
  clearTaskTokens(taskId) {
    delete this.currentTaskTokens[taskId];
  }

  // Toplam token istatistikleri
  getGlobalTokenStats() {
    return {
      total_tokens: this.totalTokensUsed,
      total_requests: this.totalRequests,
      history: this.usageHistory.slice(-10) // Son 10 çağrı
    };
  }
}

module.exports = ClaudeChannelsHandler;
