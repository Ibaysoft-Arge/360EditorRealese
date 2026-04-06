const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class GitDiffHelper {
  // Workspace'deki değişiklikleri al
  async getWorkspaceDiff(workspacePath) {
    return new Promise((resolve, reject) => {
      // git diff ve git status'u birlikte çalıştır
      const gitDiff = spawn('git', ['diff', 'HEAD'], {
        cwd: workspacePath,
        shell: true
      });

      let diffOutput = '';
      let errorOutput = '';

      gitDiff.stdout.on('data', (data) => {
        diffOutput += data.toString();
      });

      gitDiff.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      gitDiff.on('close', (code) => {
        if (code !== 0 && errorOutput) {
          // Git dizini değilse boş diff döndür
          resolve({ files: [], diff: '' });
        } else {
          // Diff'i parse et
          const parsedDiff = this.parseDiff(diffOutput);
          resolve(parsedDiff);
        }
      });

      gitDiff.on('error', () => {
        resolve({ files: [], diff: '' });
      });
    });
  }

  // Diff output'unu parse et
  parseDiff(diffOutput) {
    if (!diffOutput.trim()) {
      return { files: [], diff: '' };
    }

    const files = [];
    const lines = diffOutput.split('\n');
    let currentFile = null;
    let additions = 0;
    let deletions = 0;

    for (const line of lines) {
      // Yeni dosya başlangıcı
      if (line.startsWith('diff --git')) {
        if (currentFile) {
          files.push({ ...currentFile, additions, deletions });
        }

        // Dosya adını parse et
        const match = line.match(/diff --git a\/(.*) b\/(.*)/);
        if (match) {
          currentFile = {
            path: match[2],
            changes: []
          };
          additions = 0;
          deletions = 0;
        }
      }

      // Ekleme/silme sayısı
      if (line.startsWith('+') && !line.startsWith('+++')) {
        additions++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        deletions++;
      }
    }

    // Son dosyayı ekle
    if (currentFile) {
      files.push({ ...currentFile, additions, deletions });
    }

    return {
      files,
      diff: diffOutput,
      totalFiles: files.length,
      totalAdditions: files.reduce((sum, f) => sum + f.additions, 0),
      totalDeletions: files.reduce((sum, f) => sum + f.deletions, 0)
    };
  }

  // Değişen dosyaların listesini al (git status)
  async getChangedFiles(workspacePath) {
    return new Promise((resolve, reject) => {
      const gitStatus = spawn('git', ['status', '--porcelain'], {
        cwd: workspacePath,
        shell: true
      });

      let output = '';
      let errorOutput = '';

      gitStatus.stdout.on('data', (data) => {
        output += data.toString();
      });

      gitStatus.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      gitStatus.on('close', (code) => {
        if (code !== 0 && errorOutput) {
          resolve([]);
        } else {
          const files = this.parseGitStatus(output);
          resolve(files);
        }
      });

      gitStatus.on('error', () => {
        resolve([]);
      });
    });
  }

  // git status output'unu parse et
  parseGitStatus(output) {
    if (!output.trim()) return [];

    const files = [];
    const lines = output.split('\n').filter(l => l.trim());

    for (const line of lines) {
      const status = line.substring(0, 2).trim();
      const filePath = line.substring(3).trim();

      let statusText = 'modified';
      if (status.includes('A')) statusText = 'added';
      else if (status.includes('D')) statusText = 'deleted';
      else if (status.includes('M')) statusText = 'modified';
      else if (status.includes('?')) statusText = 'untracked';

      files.push({
        path: filePath,
        status: statusText
      });
    }

    return files;
  }

  // Belirli bir dosyanın diff'ini al
  async getFileDiff(workspacePath, filePath) {
    return new Promise((resolve, reject) => {
      const gitDiff = spawn('git', ['diff', 'HEAD', '--', filePath], {
        cwd: workspacePath,
        shell: true
      });

      let output = '';

      gitDiff.stdout.on('data', (data) => {
        output += data.toString();
      });

      gitDiff.on('close', () => {
        resolve(output);
      });

      gitDiff.on('error', () => {
        resolve('');
      });
    });
  }
}

module.exports = GitDiffHelper;
