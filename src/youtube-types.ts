export interface YouTubeApiResponse {
    kind: string;
    etag: string;
    items: YouTubeVideoItem[];
    pageInfo: PageInfo;
  }
  
  export interface YouTubeVideoItem {
    kind: string;
    etag: string;
    id: string;
    snippet: Snippet;
  }
  
  export interface PageInfo {
    totalResults: number;
    resultsPerPage: number;
  }
  
  export interface Snippet {
    publishedAt: string;
    channelId: string;
    title: string;
    description: string;
    thumbnails: Thumbnails;
    channelTitle: string;
    tags: string[];
    categoryId: string;
    liveBroadcastContent: string;
    defaultLanguage?: string;
    localized: Localized;
    defaultAudioLanguage?: string;
  }
  
  export interface Thumbnails {
    [size: string]: Thumbnail;
  }
  
  export interface Thumbnail {
    url: string;
    width: number;
    height: number;
  }
  
  export interface Localized {
    title: string;
    description: string;
  }