/**
 * Minimal ambient types for the two third-party auth SDKs loaded as plain
 * <script> tags (lib/auth/loadGoogleIdentity.ts, lib/auth/loadFacebookSdk.ts)
 * — neither ships its own npm types, and we only use a handful of methods
 * from each, so these are hand-written to exactly that surface rather than
 * a full (and larger) community type package.
 */

interface GoogleCredentialResponse {
  credential: string;
  select_by?: string;
}

interface GoogleAccountsId {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    itp_support?: boolean;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type?: 'standard' | 'icon';
      theme?: 'outline' | 'filled_blue' | 'filled_black';
      size?: 'large' | 'medium' | 'small';
      text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
      shape?: 'rectangular' | 'pill' | 'circle' | 'square';
      width?: number;
    },
  ): void;
}

interface Window {
  google?: {
    accounts: { id: GoogleAccountsId };
  };
  fbAsyncInit?: () => void;
  FB?: {
    init(config: {
      appId: string;
      version: string;
      xfbml?: boolean;
      cookie?: boolean;
    }): void;
    login(
      callback: (response: {
        authResponse?: { accessToken: string; userID: string } | null;
        status?: string;
      }) => void,
      options?: { scope?: string; return_scopes?: boolean },
    ): void;
  };
}
