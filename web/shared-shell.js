const TOPBAR_STATUS_VARIANTS = {
  full: `
    <span class="pill" id="gateway-health-pill">
      <span class="statusDot warn" id="gateway-health-dot"></span>
      Gateway:
      <span class="mono" id="gateway-health-value">Checking</span>
    </span>
    <span class="pill" id="keys-health-pill">
      <span class="statusDot warn" id="keys-health-dot"></span>
      Config:
      <span class="mono" id="keys-health-value">Unknown</span>
    </span>
    <span class="pill" id="package-version-pill">
      <span class="statusDot ok" aria-hidden="true"></span>
      Package:
      <span class="mono" id="package-version-value">__PACKAGE_VERSION__</span>
    </span>
    <div class="theme-toggle" id="theme-toggle">
      <div class="theme-toggle__track">
        <span class="theme-toggle__indicator" aria-hidden="true"></span>
        <button
          class="theme-toggle__button"
          type="button"
          data-theme-value="system"
          aria-label="Use system theme"
          title="System"
        >
          <svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="4" width="18" height="12" rx="2"></rect>
            <path d="M8 20h8M12 16v4"></path>
          </svg>
        </button>
        <button
          class="theme-toggle__button"
          type="button"
          data-theme-value="light"
          aria-label="Use light theme"
          title="Light"
        >
          <svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="4"></circle>
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path>
          </svg>
        </button>
        <button
          class="theme-toggle__button"
          type="button"
          data-theme-value="dark"
          aria-label="Use dark theme"
          title="Dark"
        >
          <svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path>
          </svg>
        </button>
      </div>
    </div>
  `,
  package: `
    <span class="pill" id="package-version-pill">
      <span class="statusDot ok" aria-hidden="true"></span>
      Package:
      <span class="mono" id="package-version-value">__PACKAGE_VERSION__</span>
    </span>
  `,
};

const NAV_ITEMS = [
  {
    key: "home",
    href: "/plugins/video-chat",
    label: "Claw Cast",
    icon: `
      <svg viewBox="0 0 24 24">
        <path d="m22 8-6 4 6 4V8z"></path>
        <rect x="2" y="6" width="14" height="12" rx="2" ry="2"></rect>
      </svg>
    `,
  },
  {
    key: "config",
    href: "/plugins/video-chat/config",
    label: "Config",
    icon: `
      <svg viewBox="0 0 24 24">
        <path
          d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
        ></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    `,
  },
  {
    key: "readme",
    href: "/plugins/video-chat/readme",
    label: "README",
    icon: `
      <svg viewBox="0 0 24 24">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <path d="M14 2v6h6"></path>
        <path d="M8 13h8"></path>
        <path d="M8 17h6"></path>
        <path d="M8 9h2"></path>
      </svg>
    `,
  },
];

function renderTopbar(element) {
  const subtitle = element.dataset.brandSubtitle || "";
  const statusVariant = element.dataset.statusVariant || "full";
  const showNavToggle = element.dataset.showNavToggle !== "false";
  const statusMarkup = TOPBAR_STATUS_VARIANTS[statusVariant] || TOPBAR_STATUS_VARIANTS.full;

  element.innerHTML = `
    <div class="topbar-left">
      ${
        showNavToggle
          ? `
        <button
          class="nav-collapse-toggle"
          id="nav-collapse-toggle"
          type="button"
          aria-controls="plugin-nav"
          aria-expanded="true"
          aria-label="Collapse navigation menu"
          title="Collapse sidebar"
        >
          <span class="nav-collapse-toggle__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M4 7h16"></path>
              <path d="M4 12h16"></path>
              <path d="M4 17h16"></path>
            </svg>
          </span>
        </button>
      `
          : ""
      }
      <div class="brand">
        <div class="brand-text">
          <span class="brand-title">Claw Cast Plugin</span>
          <span class="brand-sub"></span>
        </div>
      </div>
    </div>
    <div class="topbar-status">
      ${statusMarkup}
    </div>
  `;
  const subtitleElement = element.querySelector(".brand-sub");
  if (subtitleElement) {
    subtitleElement.textContent = subtitle;
  }
}

function renderNav(element) {
  const activeItem = element.dataset.activeNav || "home";
  const showLabel = element.dataset.showLabel !== "false";

  element.innerHTML = `
    <div class="nav-group">
      ${
        showLabel
          ? `
        <div class="nav-label nav-label--static">
          <span class="nav-label__text">Plugin</span>
        </div>
      `
          : ""
      }
      <div class="nav-group__items">
        ${NAV_ITEMS.map(
          (item) => `
          <a class="nav-item${item.key === activeItem ? " active" : ""}" href="${item.href}"${item.key === activeItem ? ' aria-current="page"' : ""}>
            <span class="nav-item__icon" aria-hidden="true">
              ${item.icon}
            </span>
            <span class="nav-item__text">${item.label}</span>
          </a>
        `,
        ).join("")}
      </div>
    </div>
  `;
}

for (const topbar of document.querySelectorAll("[data-shared-topbar]")) {
  renderTopbar(topbar);
}

for (const nav of document.querySelectorAll("[data-shared-nav]")) {
  renderNav(nav);
}
