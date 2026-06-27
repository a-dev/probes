// A stand-in for Better Auth's authClient. There is no real backend here:
// every credential combination is rejected after a short delay, so we can
// exercise the "server verdict" timeline from the article without a server.

export type LoginError = {
  code: string;
  message: string;
};

type AuthError = {
  status: number;
  code: string;
  message: string;
};

type SignInResult = { error: AuthError | null };

const FAKE_LATENCY_MS = 800;

export const authClient = {
  signIn: {
    async email(_params: {
      email: string;
      password: string;
      rememberMe?: boolean;
    }): Promise<SignInResult> {
      await new Promise((resolve) => setTimeout(resolve, FAKE_LATENCY_MS));

      // The mock backend always rejects, whatever you type.
      return {
        error: {
          status: 401,
          code: "INVALID_CREDENTIALS",
          message: "Raw auth-library message: user not found / password mismatch.",
        },
      };
    },
  },
};

// I prefer not to surface raw messages from an auth library: they can be too
// technical or reveal which field was wrong. 400/401 stay deliberately
// ambiguous so we never tell an attacker whether the email exists.
export function classifyLoginError(error: AuthError, _email: string): LoginError {
  if (error.status === 400 || error.status === 401) {
    return { code: error.code, message: "Invalid email or password." };
  }

  return { code: error.code, message: "Something went wrong. Please try again." };
}
