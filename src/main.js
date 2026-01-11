// ===== Import CSS for Vite bundling =====
import './style.css';

// ===== Navbar Scroll Effect =====
const navbar = document.getElementById('navbar');
let lastScroll = 0;

window.addEventListener('scroll', () => {
  const currentScroll = window.pageYOffset;

  if (currentScroll > 100) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }

  lastScroll = currentScroll;
});

// ===== Mobile Navigation Toggle =====
const navToggle = document.getElementById('nav-toggle');
const navLinks = document.getElementById('nav-links');

// Helper to close mobile menu
let scrollPosition = 0;

function openMobileMenu() {
  // Store current scroll position and lock body (iOS Safari fix)
  scrollPosition = window.pageYOffset;
  document.body.style.overflow = 'hidden';
  document.body.style.position = 'fixed';
  document.body.style.top = `-${scrollPosition}px`;
  document.body.style.width = '100%';
}

function closeMobileMenu() {
  navLinks.classList.remove('open');
  navToggle.classList.remove('active');
  navToggle.setAttribute('aria-expanded', 'false');
  // Restore scroll (iOS Safari fix)
  document.body.style.overflow = '';
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
  window.scrollTo(0, scrollPosition);
}

if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('open');
    navToggle.classList.toggle('active');
    navToggle.setAttribute('aria-expanded', isOpen);
    // Lock/unlock body scroll
    if (isOpen) {
      openMobileMenu();
    } else {
      closeMobileMenu();
    }
  });

  // Close menu when clicking a nav link
  navLinks.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', closeMobileMenu);
  });

  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    if (!navLinks.contains(e.target) && !navToggle.contains(e.target) && navLinks.classList.contains('open')) {
      closeMobileMenu();
    }
  });

  // Close menu on ESC key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && navLinks.classList.contains('open')) {
      closeMobileMenu();
    }
  });
}

// ===== Smooth Scroll for Navigation Links =====
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const href = this.getAttribute('href');

    // Only prevent default for internal links
    if (href !== '#' && href.startsWith('#')) {
      e.preventDefault();
      const target = document.querySelector(href);

      if (target) {
        const offsetTop = target.offsetTop - 80; // Account for fixed navbar
        window.scrollTo({
          top: offsetTop,
          behavior: 'smooth'
        });
      }
    }
  });
});

// ===== Platform Tabs Switching =====
const platformTabs = document.querySelectorAll('.platform-tab');
const platformContents = document.querySelectorAll('.platform-content');

platformTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const platform = tab.getAttribute('data-platform');

    // Remove active class and update aria-selected for all tabs
    platformTabs.forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    platformContents.forEach(c => c.classList.remove('active'));

    // Add active class and update aria-selected for clicked tab
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    const activeContent = document.querySelector(`.platform-content[data-platform="${platform}"]`);
    if (activeContent) {
      activeContent.classList.add('active');
    }
  });
});

// ===== Copy to Clipboard Functionality =====
const copyButtons = document.querySelectorAll('.copy-btn');

copyButtons.forEach(button => {
  button.addEventListener('click', async () => {
    const textToCopy = button.getAttribute('data-copy');

    try {
      await navigator.clipboard.writeText(textToCopy);

      // Visual feedback
      const originalHTML = button.innerHTML;
      button.classList.add('copied');
      button.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 8l3 3 7-7"/>
        </svg>
        <span>Copied!</span>
      `;

      // Reset after 2 seconds
      setTimeout(() => {
        button.classList.remove('copied');
        button.innerHTML = originalHTML;
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);

      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = textToCopy;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.select();

      try {
        document.execCommand('copy');
        button.innerHTML = '<span>Copied!</span>';
        setTimeout(() => {
          button.innerHTML = originalHTML;
        }, 2000);
      } catch (err) {
        console.error('Fallback copy failed:', err);
      }

      document.body.removeChild(textArea);
    }
  });
});

// ===== Intersection Observer for Scroll Animations =====
const observerOptions = {
  threshold: 0.1,
  rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
}, observerOptions);

// Observe all elements that should fade in (script is at end of body, DOM ready)
const fadeElements = document.querySelectorAll('.section-header, .feature-card, .use-case-card, .desktop-feature, .api-example, .quickstart-info');
fadeElements.forEach(el => {
  el.classList.add('fade-in');
  observer.observe(el);
});

// ===== Screenshot Carousel Navigation =====
const screenshotDots = document.querySelectorAll('.dot');
const screenshots = document.querySelectorAll('.screenshot');

screenshotDots.forEach(dot => {
  dot.addEventListener('click', () => {
    const screenshotNum = dot.getAttribute('data-screenshot');

    // Remove active class from all dots and screenshots
    screenshotDots.forEach(d => d.classList.remove('active'));
    screenshots.forEach(s => s.classList.remove('active'));

    // Add active class to clicked dot and corresponding screenshot
    dot.classList.add('active');
    const activeScreenshot = document.getElementById(`screenshot-${screenshotNum}`);
    if (activeScreenshot) {
      activeScreenshot.classList.add('active');
    }
  });
});

// Auto-rotate screenshots with pause functionality
let currentScreenshot = 1;
const totalScreenshots = 6;
let carouselInterval = null;
let carouselPaused = false;

// Check if user prefers reduced motion
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function rotateScreenshot() {
  if (carouselPaused || prefersReducedMotion) return;

  currentScreenshot = (currentScreenshot % totalScreenshots) + 1;
  const dot = document.querySelector(`.dot[data-screenshot="${currentScreenshot}"]`);
  if (dot) {
    dot.click();
  }
}

function startCarousel() {
  if (!carouselInterval && !prefersReducedMotion) {
    carouselInterval = setInterval(rotateScreenshot, 5000);
  }
}

function stopCarousel() {
  if (carouselInterval) {
    clearInterval(carouselInterval);
    carouselInterval = null;
  }
}

// Start carousel on load
startCarousel();

// Pause on hover
const screenshotContainer = document.querySelector('.desktop-screenshots');
if (screenshotContainer) {
  screenshotContainer.addEventListener('mouseenter', () => {
    carouselPaused = true;
  });
  screenshotContainer.addEventListener('mouseleave', () => {
    carouselPaused = false;
  });
}

// Pause when tab is hidden
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopCarousel();
  } else {
    startCarousel();
  }
});

// ===== Add Hover Effect to Cards =====
const cards = document.querySelectorAll('.feature-card, .use-case-card');

cards.forEach(card => {
  card.addEventListener('mouseenter', function (e) {
    const rect = this.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    this.style.setProperty('--mouse-x', `${x}px`);
    this.style.setProperty('--mouse-y', `${y}px`);
  });
});

// ===== Features Toggle =====
const toggleFeaturesBtn = document.getElementById('toggle-features');
const hiddenFeatures = document.getElementById('features-hidden');
const toggleFeaturesText = document.getElementById('toggle-features-text');
const toggleFeaturesIcon = document.getElementById('toggle-features-icon');

if (toggleFeaturesBtn && hiddenFeatures) {
  toggleFeaturesBtn.addEventListener('click', () => {
    const isVisible = hiddenFeatures.classList.toggle('visible');
    toggleFeaturesText.textContent = isVisible ? 'Show Less' : 'Show All Features';
    toggleFeaturesIcon.style.transform = isVisible ? 'rotate(180deg)' : 'rotate(0)';
  });
}

// ===== GitHub Stars Badge =====
async function fetchGitHubStars() {
  const starsElement = document.getElementById('github-stars');
  if (!starsElement) return;

  try {
    // Add timeout to prevent hanging on slow networks
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const response = await fetch('https://api.github.com/repos/valginer0/PGVectorRAGIndexer', {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const stars = data.stargazers_count;
      starsElement.textContent = stars >= 1000 ? `${(stars / 1000).toFixed(1)}k` : stars;
      starsElement.parentElement.style.display = 'inline-flex';
    }
  } catch (err) {
    // Silently fail - badge just stays hidden
    if (err.name !== 'AbortError') {
      console.log('Could not fetch GitHub stars:', err);
    }
  }
}

fetchGitHubStars();

// ===== Console Welcome Message =====
console.log('%c🔍 PGVectorRAG', 'font-size: 20px; font-weight: bold; color: #667eea;');
console.log('%cProduction-ready semantic document search for RAG applications', 'font-size: 12px; color: #a0a0b8;');
console.log('%cGitHub: https://github.com/valginer0/PGVectorRAGIndexer', 'font-size: 12px; color: #667eea;');

// ===== OS Detection for Download Buttons =====
function detectOS() {
  const userAgent = navigator.userAgent.toLowerCase();
  const platform = navigator.platform.toLowerCase();

  if (platform.includes('win') || userAgent.includes('windows')) {
    return 'windows';
  } else if (platform.includes('mac') || userAgent.includes('mac')) {
    return 'macos';
  } else if (platform.includes('linux') || userAgent.includes('linux')) {
    return 'linux';
  }
  return null;
}

function highlightOSDownload() {
  const os = detectOS();
  const osLabels = {
    'windows': 'Windows detected',
    'macos': 'macOS detected',
    'linux': 'Linux detected'
  };

  if (os) {
    const downloadOption = document.getElementById(`download-${os}`);
    const detectedText = document.getElementById('detected-os-text');

    if (downloadOption) {
      downloadOption.classList.add('detected');
    }

    if (detectedText && osLabels[os]) {
      detectedText.textContent = osLabels[os];
    }
  }
}

// Run OS detection
highlightOSDownload();

// ===== Linux Copy Button Handler =====
const linuxCopyBtn = document.querySelector('.copy-linux-cmd');
if (linuxCopyBtn) {
  linuxCopyBtn.addEventListener('click', async () => {
    const textToCopy = linuxCopyBtn.getAttribute('data-copy');
    const originalHTML = linuxCopyBtn.innerHTML;

    try {
      await navigator.clipboard.writeText(textToCopy);
      linuxCopyBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 8l3 3 7-7"/>
        </svg>
        <span>Copied! Now paste in terminal</span>
      `;

      setTimeout(() => {
        linuxCopyBtn.innerHTML = originalHTML;
      }, 3000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  });
}
