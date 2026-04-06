const Anthropic = require('@anthropic-ai/sdk');

class AnthropicAPIHandler {
  constructor() {
    this.client = null;
    this.apiKey = null;
  }

  setApiKey(apiKey) {
    this.apiKey = apiKey;
    this.client = new Anthropic({
      apiKey: apiKey
    });
    console.log('✅ Anthropic API key ayarlandı');
  }

  hasApiKey() {
    return !!this.apiKey;
  }

  async processPMTask(taskRequest, workspaces, agents) {
    if (!this.client) {
      throw new Error('API key ayarlanmamış! Settings → API Key girin.');
    }

    const workspace = workspaces.find(w => w.name === taskRequest.workspaceName);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const idleAgents = agents.filter(a => a.status === 'idle');
    if (idleAgents.length === 0) {
      throw new Error('Hiç boşta agent yok!');
    }

    const systemPrompt = `Sen bir Product Manager'sın (PM). Sert ama adil konuşursun.

WORKSPACE: ${workspace.name} (${workspace.path})

BOŞTA OLAN AGENTLAR:
${idleAgents.map(a => `- ID: ${a.id}, İsim: ${a.name}, Rol: ${a.role}`).join('\n')}

PATRON GÖREVI: "${taskRequest.task}"

GÖREVIN:
1. Hangi agentları kullanacağına karar ver
2. Her agent için spesifik alt görev tanımla
3. PM mesajlarını yaz (sert konuşabilirsin, argo kullan)

ÖNEMLİ: Cevabın SADECE JSON olmalı!

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
}`;

    const userPrompt = `Patron'dan görev: "${taskRequest.task}"

JSON formatında cevap ver (başka hiçbir şey yazma):`;

    try {
      const response = await this.client.messages.create({
        model: 'claude-opus-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: userPrompt
        }]
      });

      const content = response.content[0].text;

      // JSON parse et
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('PM response format error: ' + content.substring(0, 200));
      }
    } catch (error) {
      throw new Error('Anthropic API Error: ' + error.message);
    }
  }

  async runAgent(agentConfig, task, workspace) {
    if (!this.client) {
      throw new Error('API key ayarlanmamış!');
    }

    const systemPrompt = `Sen bir ${agentConfig.role} agent'sın. İsmin: ${agentConfig.name}.

WORKSPACE: ${workspace.name} (${workspace.path})

PM sana görev verdi: ${task}

Görevi analiz et ve detaylı rapor ver. Kod örnekleri sun.`;

    try {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: 'Görevi yerine getir ve detaylı rapor sun.'
        }]
      });

      return response.content[0].text;
    } catch (error) {
      throw new Error('Agent API Error: ' + error.message);
    }
  }
}

module.exports = AnthropicAPIHandler;
