const Anthropic = require('@anthropic-ai/sdk');

class ClaudeAPIHandler {
  constructor() {
    this.client = null;
    this.apiKey = null;
  }

  setApiKey(apiKey) {
    this.apiKey = apiKey;
    this.client = new Anthropic({
      apiKey: apiKey
    });
  }

  hasApiKey() {
    return !!this.apiKey;
  }

  async callClaude(messages, systemPrompt = null) {
    if (!this.client) {
      throw new Error('Claude API key not set. Please configure in settings.');
    }

    const params = {
      model: 'claude-opus-4-6',
      max_tokens: 8000,
      messages: messages
    };

    if (systemPrompt) {
      params.system = systemPrompt;
    }

    const response = await this.client.messages.create(params);
    return response;
  }

  // PM olarak görev işle
  async processPMTask(taskRequest, workspaces, agents) {
    const workspace = workspaces.find(w => w.name === taskRequest.workspaceName);

    if (!workspace) {
      throw new Error('Workspace not found');
    }

    // PM system prompt
    const systemPrompt = `Sen bir Product Manager'sın (PM). İsmin Claude PM.

KİŞİLİĞİN:
- Sert ama adil konuşursun
- Agentlara direktif verirsin, argo kullanabilirsin
- Patron'a (kullanıcı) sadıksın
- İşleri organize edersin

GÖREV SÜRECİ:
1. Patron'dan görev al
2. Hangi agentların gerekli olduğuna karar ver
3. Her agent'a spesifik alt görev ver
4. Agentları motive et (sert konuş!)
5. Sonuçları raporla

MEVCUT WORKSPACE:
- İsim: ${workspace.name}
- Yol: ${workspace.path}
${workspace.description ? `- Açıklama: ${workspace.description}` : ''}

MEVCUT AGENT HAVUZU:
${agents.map(a => `- ${a.name} (${a.role}) - ${a.status}`).join('\n')}

Patron'dan gelen görev: "${taskRequest.task}"

ŞİMDİ YAPMAN GEREKENLER:
1. Hangi agentları kullanacağına karar ver (boştaki agentlardan seç)
2. Her agent için spesifik alt görev tanımla
3. PM mesajını yaz (sert ve motive edici)
4. JSON formatında cevap ver:

{
  "selectedAgents": [
    {
      "agentId": "agent-uuid",
      "agentName": "İsim",
      "subTask": "Bu agent'ın yapacağı spesifik görev"
    }
  ],
  "pmMessages": [
    {
      "to": "agent-name",
      "message": "Sert PM mesajı buraya"
    }
  ],
  "summary": "Patron'a rapor özeti"
}`;

    const messages = [
      {
        role: 'user',
        content: `Yukarıdaki görev için plan hazırla ve agentları ata. JSON formatında cevap ver.`
      }
    ];

    const response = await this.callClaude(messages, systemPrompt);

    // Extract JSON from response
    const content = response.content[0].text;
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('PM response format error');
    }
  }

  // Agent çalıştır (subagent spawn için)
  async runAgent(agentConfig, task, workspace) {
    const systemPrompt = `Sen bir ${agentConfig.role} agent'sın. İsmin: ${agentConfig.name}.

PM (Product Manager) sana görev verdi. Profesyonel ve etkili çalış.

WORKSPACE:
- İsim: ${workspace.name}
- Yol: ${workspace.path}

GÖREV: ${task}

ÖNEMLİ:
- Workspace'teki dosyaları analiz et
- Gerekli değişiklikleri planla
- Kod örnekleri ver
- Detaylı rapor sun`;

    const messages = [
      {
        role: 'user',
        content: `Görevi yerine getir ve detaylı rapor ver.`
      }
    ];

    const response = await this.callClaude(messages, systemPrompt);
    return response.content[0].text;
  }
}

module.exports = ClaudeAPIHandler;
