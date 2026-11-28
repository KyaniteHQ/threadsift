export type Digest = {
  readonly title: string;
  readonly topic: string;
  readonly tags: readonly string[];
  readonly summary: string;
  readonly keyPoints: readonly string[];
  readonly keptComments?: readonly string[];
};

export interface SeedItem {
  readonly key: string;
  readonly url: string;
  readonly content?: string;
  readonly page?: {
    readonly markdown: string;
    readonly title: string;
    readonly author: string;
  };
  readonly digest: Digest;
  readonly read?: boolean;
  readonly accent?: "moss" | "cobalt" | "rust" | "iris" | "teal";
}

export interface SeedHighlight {
  readonly key: string;
  readonly exact: string;
}

export interface Comment {
  readonly id: string;
  readonly author: string;
  readonly body: string;
  readonly score: number;
  readonly replies?: readonly Comment[];
}

export interface RedditPost {
  readonly id: string;
  readonly subreddit: string;
  readonly title: string;
  readonly author: string;
  readonly text: string;
  readonly comments: readonly Comment[];
  readonly total: number;
}

export interface XPost {
  readonly id: string;
  readonly author: string;
  readonly text: string;
}

export interface XReply extends XPost {
  readonly parentId: string;
  readonly likes: number;
}

export interface XThread extends XPost {
  readonly quoted?: readonly XPost[];
  readonly replies: readonly XReply[];
}
