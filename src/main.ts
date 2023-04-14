import {
  App,
  Modal,
  Notice,
  TextComponent,
  Plugin,
  PluginSettingTab,
  TFile,
  Setting,
} from "obsidian";

import axios from 'axios';
import { YouTubeApiResponse, YouTubeVideoItem, Snippet } from './youtube-types';
import { FolderSuggest } from "./suggesters/FolderSuggester";
import { FileSuggest } from "./suggesters/FileSuggester";
import {
  getTemplateContents,
  applyTemplateTransformations,
  getFunctionConstructor,
  useTemplaterPluginInFile,
} from './utils/template';

interface YoutubeSearchSettings {
  apiKey: string;
  folderLocation: string;
  noteNamingTemplate: string;
  templatePath: string;
}

const DEFAULT_SETTINGS: YoutubeSearchSettings = {
  apiKey: "",
  folderLocation: "",
  noteNamingTemplate: "{title}",
  templatePath: ""
};

export default class YoutubeSearch extends Plugin {
  settings: YoutubeSearchSettings;

  async onload() {
    await this.loadSettings();
    this.addCommand({
      id: 'create-youtube-note',
      name: 'Create YouTube Note',
      callback: async () => {
        const url = await this.showURLPrompt();
        console.log('URL:', url);
        if (url && this.isValidYouTubeUrl(url)) {
          const videoId = this.extractVideoId(url);
          const videoInfo = await this.fetchVideoInfo(videoId);
          console.log('Video info:', videoInfo);
          if (videoInfo) {
            await this.createYouTubeNote(videoInfo.snippet, videoId);
          } else {
            console.error('Failed to fetch video information');
            new Notice('Failed to fetch video information');
          }
        } else {
          console.error('Invalid YouTube URL');
          new Notice('Invalid YouTube URL');
        }
      },
    });
    this.addSettingTab(new SampleSettingTab(this.app, this));
  }

  onunload() {
    console.log("unloading plugin");
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async getAllFolders(): Promise<string[]> {
    const folderSet = new Set<string>();
    this.app.vault.getMarkdownFiles().forEach((file) => {
      const folderPath = file.path.split('/').slice(0, -1).join('/');
      folderSet.add(folderPath);
    });
    return Array.from(folderSet).sort();
  }

  async showURLPrompt(): Promise<string | null> {
    return new Promise((resolve) => {
      const modal = new URLInputModal(this.app, resolve);
      modal.open();
    });
  }

  async createFile(filePath: string, content: string): Promise<void> {
    try {
      await this.app.vault.create(filePath, content);
      new Notice('YouTube note created successfully');
    } catch (error) {
      console.error('Error creating YouTube note:', error);
      new Notice('Failed to create YouTube note');
    }
  }

  extractVideoId(url: string): string {
    return url.split('v=')[1].substring(0, 11);
  }

  isValidYouTubeUrl(url: string): boolean {
    const regex = /^((?:https?:)?\/\/)?((?:www|m)\.)?((?:youtube\.com|youtu.be))(\/(?:[\w\-]+\?v=|embed\/|v\/)?)([\w\-]+)(\S+)?$/;
    return regex.test(url);
  }

  formatNoteTitle(title: string): string {
    const template = this.settings.noteNamingTemplate;
    return template.replace('{title}', this.cleanTitle(title));
  }

  getNotePath(title: string): string {
    const folderPath = this.settings.folderLocation;
    return `${folderPath}/${title}.md`;
  }

  async fetchVideoInfo(videoId: string): Promise<{ snippet: Snippet; videoId: string } | null> {
    const apiUrl = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet&key=${this.settings.apiKey}`;

    try {
      const response = await axios.get<YouTubeApiResponse>(apiUrl);
      console.log('YouTube API response:', response.data);
      if (response.data.items.length === 0) {
        return null;
      }
      return {
        snippet: response.data.items[0].snippet,
        videoId: videoId,
      };
    } catch (error) {
      console.error('Error fetching video information:', error);
      return null;
    }
  }


  async createYouTubeNote(snippet: Snippet, videoId: string): Promise<void> {
    const title = this.formatNoteTitle(snippet.title);
    const filePath = this.getNotePath(title);

    const variables = {
      videoTitle: snippet.title,
      description: snippet.description,
      publishedAt: snippet.publishedAt,
      channelId: snippet.channelId,
      channelTitle: snippet.channelTitle,
      thumbnail: snippet.thumbnails.high.url,
      videoId: videoId
    };

    let content = '';
    if (this.settings.templatePath) {
      content = await getTemplateContents(this.app, this.settings.templatePath);
      content = this.replaceVariableSyntax(variables, content);
    } else {
      content = `# ${snippet.title}\n\n${snippet.description}\n\n[Watch on YouTube](https://www.youtube.com/watch?v=${videoId})`;
    }

    await this.createFile(filePath, content);
    const file = this.app.vault.getAbstractFileByPath(filePath);

    if (file instanceof TFile) {
      const templater = (this.app as any).plugins.plugins['templater-obsidian'];
      if (templater) {
        await templater.templater.overwrite_file_commands(file);
      }
      this.app.workspace.activeLeaf.openFile(file);
    }

  }

  cleanTitle(title) {
    const forbiddenChars = /[/\\?%*:|"<>]/g;
    const cleanedTitle = title.replace(forbiddenChars, '_');
    return cleanedTitle;
  }

  replaceVariableSyntax(variables: Record<string, any>, text: string): string {
    if (!text?.trim()) {
      return '';
    }

    const entries = Object.entries(variables);

    return entries
      .reduce((result, [key, val = '']) => {
        return result.replace(new RegExp(`{{${key}}}`, 'ig'), val);
      }, text)
      .replace(/{{\w+}}/gi, '')
      .trim();
  }

}

class URLInputModal extends Modal {
  private resolve: (value: string | null) => void;
  private textInput: TextComponent;

  constructor(app: App, resolve: (value: string | null) => void) {
    super(app);
    this.resolve = resolve;
  }

  onOpen() {
    let { contentEl } = this;
    contentEl.createEl('h2', { text: 'Enter YouTube URL' });

    this.textInput = new TextComponent(contentEl)
      .setPlaceholder('YouTube URL')
      .setValue('');

    const submitButton = contentEl.createEl('button', { text: 'Submit' });
    submitButton.onclick = () => {
      this.resolve(this.textInput.getValue());
      this.close();
    };
  }

  onClose() {
    this.resolve(null);
  }
}

class SampleModal extends Modal {
  constructor(app: App) {
    super(app);
  }
  onOpen() {
    let { contentEl } = this;
    contentEl.setText("Woah!");
  }
  onClose() {
    let { contentEl } = this;
    contentEl.empty();
  }
}

class SampleSettingTab extends PluginSettingTab {
  plugin: YoutubeSearch;

  constructor(app: App, plugin: YoutubeSearch) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    let { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Settings for my awesome plugin." });

    new Setting(containerEl)
      .setName('YouTube API Key')
      .setDesc('Enter your YouTube Data API key')
      .addText((text) =>
        text
          .setPlaceholder('Enter your API key here')
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Templater Template Path")
      .setDesc("Enter the path to the Templater template you want to use for new YouTube notes.")
      .addSearch((cb) => {
        try {
          new FileSuggest(this.app, cb.inputEl);
        } catch {
          // eslint-disable
        }
        cb.setPlaceholder("Example: folder1/template")
          .setValue(this.plugin.settings.templatePath)
          .onChange((newPath) => {
            this.plugin.settings.templatePath = newPath;
            this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('New file location')
      .setDesc('New YouTube notes will be placed here.')
      .addText((text) => {
        try {
          new FolderSuggest(this.app, text.inputEl);
        } catch {
          // eslint-disable
        }
        text.setPlaceholder('Example: folder1/folder2')
          .setValue(this.plugin.settings.folderLocation)
          .onChange(new_folder => {
            this.plugin.settings.folderLocation = new_folder;
            this.plugin.saveSettings();
          });
      });

    // Note naming template setting
    new Setting(containerEl)
      .setName("Note Naming Template")
      .setDesc("Enter the template for new YouTube note names. Use {title} for video title.")
      .addText((text) =>
        text
          .setPlaceholder("Enter note naming template")
          .setValue(this.plugin.settings.noteNamingTemplate)
          .onChange(async (value) => {
            this.plugin.settings.noteNamingTemplate = value;
            await this.plugin.saveSettings();
          })
      );
  }

  setupFolderSettings(containerEl: HTMLElement): void {
    this.plugin.getAllFolders().then((allFolders) => {
      const folderSetting = new Setting(containerEl)
        .setName("Folder for YouTube notes")
        .setDesc("Select a folder where you want to save YouTube notes.");

      let folderInputComponent: TextComponent;

      folderSetting.addText((text) => {
        folderInputComponent = text;
        return text
          .setPlaceholder("Type folder name here")
          .setValue(this.plugin.settings.folderLocation)
          .onChange(async (value) => {
            this.plugin.settings.folderLocation = value;
            await this.plugin.saveSettings();
          });
      });

      const folderInput = folderInputComponent.inputEl;

      const wrapper = document.createElement("div");
      wrapper.style.position = "relative";

      // Insert the wrapper right after the folderInput element
      folderInput.parentNode.insertBefore(wrapper, folderInput.nextSibling);

      const folderDropdown = document.createElement("select");
      folderDropdown.style.display = "none";
      folderDropdown.style.width = "100%";
      folderDropdown.style.position = "absolute";
      folderDropdown.size = 5; // Set the number of lines you want to display
      wrapper.appendChild(folderDropdown);

      function updateDropdownOptions(value: string) {
        folderDropdown.innerHTML = "";
        allFolders
          .filter((folder) => folder.toLowerCase().includes(value.toLowerCase()))
          .forEach((folder) => {
            const option = document.createElement("option");
            option.text = folder;
            option.value = folder;
            folderDropdown.add(option);
          });
      }

      folderInput.addEventListener("input", (e) => {
        const value = (e.target as HTMLInputElement).value;
        updateDropdownOptions(value);
        folderDropdown.style.display = value ? "block" : "none";
      });

      folderInput.addEventListener("click", () => {
        const value = folderInputComponent.getValue();
        updateDropdownOptions(value);
        folderDropdown.style.display = value ? "block" : "none";
      });

      folderDropdown.addEventListener("change", () => {
        folderInputComponent.setValue(folderDropdown.value);
        this.plugin.settings.folderLocation = folderDropdown.value;
        folderDropdown.style.display = "none";
      });
    });
  }

}

