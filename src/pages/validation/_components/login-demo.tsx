// The single React island mounted by the Astro page: both forms, side by side.
import { NaiveLoginForm } from "./naive-login-form";
import { RewardEarlyLoginForm } from "./login-form";

export function LoginDemo() {
  return (
    <div className="demo-grid">
      <section className="demo-column">
        <header className="demo-head">
          <h2 className="demo-title">Naive · too eager</h2>
          <p className="demo-sub">
            Validates on every keystroke, even mid-typing. The server banner lingers while you fix
            your input.
          </p>
        </header>
        <NaiveLoginForm />
      </section>

      <section className="demo-column">
        <header className="demo-head">
          <h2 className="demo-title">Reward early · punish late</h2>
          <p className="demo-sub">
            Errors are born on blur and die the instant you start fixing them. The server verdict
            clears the moment you type.
          </p>
        </header>
        <RewardEarlyLoginForm />
      </section>
    </div>
  );
}
