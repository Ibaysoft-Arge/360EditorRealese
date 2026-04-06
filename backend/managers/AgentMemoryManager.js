const fs = require('fs');
const path = require('path');
const os = require('os');

class AgentMemoryManager {
  constructor() {
    this.memoryDir = '.360editor';
    this.agentsDir = 'agents';

    // Global hafıza dizini (tüm projeler için)
    this.globalMemoryDir = path.join(os.homedir(), '.360editor', 'global', 'agents');
    this.ensureGlobalMemoryStructure();
  }

  // Global hafıza klasörünü oluştur
  ensureGlobalMemoryStructure() {
    if (!fs.existsSync(this.globalMemoryDir)) {
      fs.mkdirSync(this.globalMemoryDir, { recursive: true });
    }
  }

  // Workspace'de .360editor/agents/ klasörünü oluştur
  ensureMemoryStructure(workspacePath) {
    const memoryPath = path.join(workspacePath, this.memoryDir);
    const agentsPath = path.join(memoryPath, this.agentsDir);

    if (!fs.existsSync(memoryPath)) {
      fs.mkdirSync(memoryPath, { recursive: true });
    }

    if (!fs.existsSync(agentsPath)) {
      fs.mkdirSync(agentsPath, { recursive: true });
    }

    // workspace-context.md yoksa oluştur
    const contextFile = path.join(memoryPath, 'workspace-context.md');
    if (!fs.existsSync(contextFile)) {
      fs.writeFileSync(contextFile, `# Workspace Context

## Proje Hakkında
[Proje açıklaması buraya yazılacak]

## Teknolojiler
- [Kullanılan teknolojiler]

## Önemli Kurallar
- [Kodlama standartları ve kurallar]

## API Endpoints
- [API endpoint'ler]

## Database Schema
- [Veritabanı şeması]
`, 'utf-8');
    }

    return { memoryPath, agentsPath };
  }

  // Global agent hafızasını oku (tüm projeler için)
  getGlobalAgentMemory(agentId, agentName) {
    try {
      const memoryFile = path.join(this.globalMemoryDir, `${agentId}-${agentName}.md`);

      if (fs.existsSync(memoryFile)) {
        return fs.readFileSync(memoryFile, 'utf-8');
      } else {
        // Global hafıza dosyası yoksa oluştur
        const initialMemory = `# ${agentName} - Genel Hafıza (Tüm Projeler)

## Karakter & Tarz
[Agent'ın kişiliği, konuşma tarzı, çalışma yaklaşımı]

## Genel Bilgiler
[Tüm projelerde kullanılacak genel bilgiler]

## Tercihler
[Kodlama tercihleri, stil tercihleri]
`;
        fs.writeFileSync(memoryFile, initialMemory, 'utf-8');
        return initialMemory;
      }
    } catch (error) {
      console.error('Global agent hafızası okunamadı:', error.message);
      return '';
    }
  }

  // Proje bazlı agent hafızasını oku
  getAgentMemory(workspacePath, agentId, agentName) {
    try {
      const { agentsPath } = this.ensureMemoryStructure(workspacePath);
      const memoryFile = path.join(agentsPath, `${agentId}-${agentName}.md`);

      if (fs.existsSync(memoryFile)) {
        return fs.readFileSync(memoryFile, 'utf-8');
      } else {
        // Hafıza dosyası yoksa oluştur
        const initialMemory = `# ${agentName} - Proje Hafızası

## Öğrenilen Bilgiler
[Bu projeye özel bilgiler]

## Önceki Görevler
[Bu projede tamamlanan görevlerden öğrenilenler]

## Özel Notlar
[Bu proje için özel notlar]
`;
        fs.writeFileSync(memoryFile, initialMemory, 'utf-8');
        return initialMemory;
      }
    } catch (error) {
      console.error('Agent hafızası okunamadı:', error.message);
      return '';
    }
  }

  // Her iki hafızayı birleştir (global + project)
  getCombinedAgentMemory(workspacePath, agentId, agentName) {
    const globalMemory = this.getGlobalAgentMemory(agentId, agentName);
    const projectMemory = this.getAgentMemory(workspacePath, agentId, agentName);

    return {
      global: globalMemory,
      project: projectMemory,
      combined: `${globalMemory ? '# 🌍 GENEL HAFIZA (Tüm Projeler)\n\n' + globalMemory + '\n\n' : ''}${projectMemory ? '# 📁 PROJE HAFIZASI\n\n' + projectMemory : ''}`
    };
  }

  // Workspace context'i oku
  getWorkspaceContext(workspacePath) {
    try {
      const { memoryPath } = this.ensureMemoryStructure(workspacePath);
      const contextFile = path.join(memoryPath, 'workspace-context.md');

      if (fs.existsSync(contextFile)) {
        return fs.readFileSync(contextFile, 'utf-8');
      }
      return '';
    } catch (error) {
      console.error('Workspace context okunamadı:', error.message);
      return '';
    }
  }

  // Global agent hafızasına not ekle
  addToGlobalAgentMemory(agentId, agentName, note) {
    try {
      const memoryFile = path.join(this.globalMemoryDir, `${agentId}-${agentName}.md`);
      let memory = this.getGlobalAgentMemory(agentId, agentName);

      const timestamp = new Date().toISOString().split('T')[0];
      const newNote = `\n### ${timestamp}\n${note}\n`;

      // "## Genel Bilgiler" bölümüne ekle
      if (memory.includes('## Genel Bilgiler')) {
        memory = memory.replace(
          '## Genel Bilgiler\n[Tüm projelerde kullanılacak genel bilgiler]',
          `## Genel Bilgiler${newNote}`
        );

        if (!memory.includes('[Tüm projelerde kullanılacak genel bilgiler]')) {
          memory = memory.replace(
            '## Genel Bilgiler\n',
            `## Genel Bilgiler${newNote}`
          );
        }
      }

      fs.writeFileSync(memoryFile, memory, 'utf-8');
      return true;
    } catch (error) {
      console.error('Global agent hafızasına yazılamadı:', error.message);
      return false;
    }
  }

  // Proje bazlı agent hafızasına not ekle
  addToAgentMemory(workspacePath, agentId, agentName, note) {
    try {
      const { agentsPath } = this.ensureMemoryStructure(workspacePath);
      const memoryFile = path.join(agentsPath, `${agentId}-${agentName}.md`);

      let memory = this.getAgentMemory(workspacePath, agentId, agentName);

      // Öğrenilen Bilgiler bölümüne ekle
      const timestamp = new Date().toISOString().split('T')[0];
      const newNote = `\n### ${timestamp}\n${note}\n`;

      // "## Öğrenilen Bilgiler" bölümünden sonra ekle
      if (memory.includes('## Öğrenilen Bilgiler')) {
        memory = memory.replace(
          '## Öğrenilen Bilgiler\n[Bu projeye özel bilgiler]',
          `## Öğrenilen Bilgiler${newNote}`
        );

        // Eğer zaten notlar varsa, en üste ekle
        if (!memory.includes('[Bu projeye özel bilgiler]')) {
          memory = memory.replace(
            '## Öğrenilen Bilgiler\n',
            `## Öğrenilen Bilgiler${newNote}`
          );
        }
      }

      fs.writeFileSync(memoryFile, memory, 'utf-8');
      return true;
    } catch (error) {
      console.error('Agent hafızasına yazılamadı:', error.message);
      return false;
    }
  }

  // Global agent hafızasını tamamen güncelle
  updateGlobalAgentMemory(agentId, agentName, content) {
    try {
      const memoryFile = path.join(this.globalMemoryDir, `${agentId}-${agentName}.md`);
      fs.writeFileSync(memoryFile, content, 'utf-8');
      return true;
    } catch (error) {
      console.error('Global agent hafızası güncellenemedi:', error.message);
      return false;
    }
  }

  // Workspace context'e not ekle
  addToWorkspaceContext(workspacePath, section, note) {
    try {
      const { memoryPath } = this.ensureMemoryStructure(workspacePath);
      const contextFile = path.join(memoryPath, 'workspace-context.md');

      let context = this.getWorkspaceContext(workspacePath);

      const timestamp = new Date().toISOString().split('T')[0];
      const newNote = `\n### ${timestamp}\n${note}\n`;

      // Belirtilen section'a ekle
      if (context.includes(`## ${section}`)) {
        context = context.replace(
          `## ${section}\n[`,
          `## ${section}${newNote}\n[`
        );
      }

      fs.writeFileSync(contextFile, context, 'utf-8');
      return true;
    } catch (error) {
      console.error('Workspace context\'e yazılamadı:', error.message);
      return false;
    }
  }

  // Hafıza dosyasını tamamen güncelle
  updateAgentMemory(workspacePath, agentId, agentName, content) {
    try {
      const { agentsPath } = this.ensureMemoryStructure(workspacePath);
      const memoryFile = path.join(agentsPath, `${agentId}-${agentName}.md`);

      fs.writeFileSync(memoryFile, content, 'utf-8');
      return true;
    } catch (error) {
      console.error('Agent hafızası güncellenemedi:', error.message);
      return false;
    }
  }

  // Workspace context'i tamamen güncelle
  updateWorkspaceContext(workspacePath, content) {
    try {
      const { memoryPath } = this.ensureMemoryStructure(workspacePath);
      const contextFile = path.join(memoryPath, 'workspace-context.md');

      fs.writeFileSync(contextFile, content, 'utf-8');
      return true;
    } catch (error) {
      console.error('Workspace context güncellenemedi:', error.message);
      return false;
    }
  }

  // Tüm agent hafızalarını listele
  listAgentMemories(workspacePath) {
    try {
      const { agentsPath } = this.ensureMemoryStructure(workspacePath);
      const files = fs.readdirSync(agentsPath);

      return files
        .filter(f => f.endsWith('.md'))
        .map(f => {
          const [agentId, ...nameParts] = f.replace('.md', '').split('-');
          return {
            agentId,
            agentName: nameParts.join('-'),
            fileName: f,
            path: path.join(agentsPath, f)
          };
        });
    } catch (error) {
      console.error('Agent hafızaları listelenemedi:', error.message);
      return [];
    }
  }
}

module.exports = AgentMemoryManager;
