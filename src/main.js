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

// Observe all elements that should fade in
document.addEventListener('DOMContentLoaded', () => {
  const fadeElements = document.querySelectorAll('.feature-card, .use-case-card, .desktop-feature, .api-example');
  fadeElements.forEach(el => {
    el.classList.add('fade-in');
    observer.observe(el);
  });
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

// Auto-rotate screenshots every 5 seconds
let currentScreenshot = 1;
const totalScreenshots = 6;
setInterval(() => {
  currentScreenshot = (currentScreenshot % totalScreenshots) + 1;
  const dot = document.querySelector(`.dot[data-screenshot="${currentScreenshot}"]`);
  if (dot) {
    dot.click();
  }
}, 5000);

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

// ===== Console Welcome Message =====
console.log('%c🔍 PGVectorRAGIndexer', 'font-size: 20px; font-weight: bold; color: #667eea;');
console.log('%cProduction-ready semantic document search for RAG applications', 'font-size: 12px; color: #a0a0b8;');
console.log('%cGitHub: https://github.com/valginer0/PGVectorRAGIndexer', 'font-size: 12px; color: #667eea;');
