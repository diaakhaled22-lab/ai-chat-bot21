/**
 * Sliding Panel Overlay Interface Controller
 * Written in Vanilla TypeScript
 */

interface PasswordToggleElements {
  input: HTMLInputElement;
  toggleBtn: HTMLButtonElement;
  eyeIcon: SVGElement;
  eyeOffIcon: SVGElement;
}

interface SlidingAuthOptions {
  containerId: string;
  btnToClientId: string;
  btnToAdminId: string;
  activeClass?: string;
}

export class SlidingAuthManager {
  private container: HTMLElement;
  private btnToClient: HTMLButtonElement;
  private btnToAdmin: HTMLButtonElement;
  private activeClass: string;

  constructor(options: SlidingAuthOptions) {
    const container = document.getElementById(options.containerId);
    const btnToClient = document.getElementById(options.btnToClientId) as HTMLButtonElement;
    const btnToAdmin = document.getElementById(options.btnToAdminId) as HTMLButtonElement;

    if (!container || !btnToClient || !btnToAdmin) {
      throw new Error("SlidingAuthManager: Required DOM elements could not be found.");
    }

    this.container = container;
    this.btnToClient = btnToClient;
    this.btnToAdmin = btnToAdmin;
    this.activeClass = options.activeClass ?? "active";

    this.initEvents();
    this.initPasswordToggles();
  }

  /**
   * Initializes overlay sliding click handlers
   */
  private initEvents(): void {
    // Click "CLIENT LOGIN" on overlay -> Slide overlay to the Left, revealing Client form
    this.btnToClient.addEventListener("click", () => {
      this.slideToClient();
    });

    // Click "ADMIN LOGIN" on overlay -> Slide overlay to the Right, revealing Admin form
    this.btnToAdmin.addEventListener("click", () => {
      this.slideToAdmin();
    });
  }

  /**
   * Slides overlay to reveal Client login form
   */
  public slideToClient(): void {
    this.container.classList.add(this.activeClass);
  }

  /**
   * Slides overlay to reveal Admin login form
   */
  public slideToAdmin(): void {
    this.container.classList.remove(this.activeClass);
  }

  /**
   * Configures show/hide password toggle buttons
   */
  private initPasswordToggles(): void {
    this.setupPasswordToggle({
      inputId: "admin-password",
      btnId: "admin-password-toggle",
      eyeIconId: "admin-eye-icon",
      eyeOffIconId: "admin-eye-off-icon",
    });

    this.setupPasswordToggle({
      inputId: "client-password",
      btnId: "client-password-toggle",
      eyeIconId: "client-eye-icon",
      eyeOffIconId: "client-eye-off-icon",
    });
  }

  /**
   * Helper to attach toggle visibility behavior to a specific password input
   */
  private setupPasswordToggle(config: {
    inputId: string;
    btnId: string;
    eyeIconId: string;
    eyeOffIconId: string;
  }): void {
    const input = document.getElementById(config.inputId) as HTMLInputElement | null;
    const toggleBtn = document.getElementById(config.btnId) as HTMLButtonElement | null;
    const eyeIcon = document.getElementById(config.eyeIconId) as unknown as SVGElement | null;
    const eyeOffIcon = document.getElementById(config.eyeOffIconId) as unknown as SVGElement | null;

    if (!input || !toggleBtn || !eyeIcon || !eyeOffIcon) return;

    toggleBtn.addEventListener("click", () => {
      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";

      eyeIcon.classList.toggle("hidden", isPassword);
      eyeOffIcon.classList.toggle("hidden", !isPassword);
    });
  }
}

// Auto-instantiate when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  new SlidingAuthManager({
    containerId: "main-container",
    btnToClientId: "btn-to-client",
    btnToAdminId: "btn-to-admin",
    activeClass: "active",
  });
});
