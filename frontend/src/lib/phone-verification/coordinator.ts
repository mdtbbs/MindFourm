type VerificationHandler = () => Promise<boolean>;

let handler: VerificationHandler | null = null;
let activeRequest: Promise<boolean> | null = null;

export function registerPhoneVerificationHandler(nextHandler: VerificationHandler | null) {
  handler = nextHandler;
}

export async function requestPhoneVerification(): Promise<boolean> {
  if (!handler) {
    return false;
  }

  if (!activeRequest) {
    activeRequest = handler().finally(() => {
      activeRequest = null;
    });
  }

  return activeRequest;
}
