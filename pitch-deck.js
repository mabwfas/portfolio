/* ============================================
   DIGITAL HEROES - ULTRA PREMIUM PITCH DECK
   1000% Enhanced - Cinematic JavaScript
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
    initParticles();
    initSlideNavigation();
    initKeyboardNav();
    initScrollObserver();
    initScrollAnimations();
    initCounters();
    initAutoPlay();
    initProgressBar();
    initTimelineProgress();
    hideKeyboardHint();
});

// Global state
let currentSlide = 1;
let totalSlides = 12;
let autoPlayInterval = null;
let isAutoPlaying = false;

/* ============================================
   PARTICLE SYSTEM
   ============================================ */
function initParticles() {
    const canvas = document.getElementById('particles');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let particles = [];
    const particleCount = 80;

    // Resize canvas
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Particle class
    class Particle {
        constructor() {
            this.reset();
        }

        reset() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.size = Math.random() * 2 + 0.5;
            this.speedX = (Math.random() - 0.5) * 0.5;
            this.speedY = (Math.random() - 0.5) * 0.5;
            this.opacity = Math.random() * 0.5 + 0.2;
            this.pulseSpeed = Math.random() * 0.02 + 0.01;
            this.pulseOffset = Math.random() * Math.PI * 2;
        }

        update() {
            this.x += this.speedX;
            this.y += this.speedY;

            // Wrap around screen
            if (this.x < 0) this.x = canvas.width;
            if (this.x > canvas.width) this.x = 0;
            if (this.y < 0) this.y = canvas.height;
            if (this.y > canvas.height) this.y = 0;

            // Pulse opacity
            this.currentOpacity = this.opacity + Math.sin(Date.now() * this.pulseSpeed + this.pulseOffset) * 0.2;
        }

        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${this.currentOpacity})`;
            ctx.fill();
        }
    }

    // Create particles
    for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle());
    }

    // Draw connections
    function drawConnections() {
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < 150) {
                    const opacity = (1 - distance / 150) * 0.15;
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = `rgba(99, 102, 241, ${opacity})`;
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }
    }

    // Animation loop
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        particles.forEach(particle => {
            particle.update();
            particle.draw();
        });

        drawConnections();
        requestAnimationFrame(animate);
    }

    animate();
}

/* ============================================
   SLIDE NAVIGATION
   ============================================ */
function initSlideNavigation() {
    const slides = document.querySelectorAll('.slide');
    const indicatorsContainer = document.getElementById('slideIndicators');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const currentSlideEl = document.getElementById('currentSlide');
    const totalSlidesEl = document.getElementById('totalSlides');

    totalSlides = slides.length;
    totalSlidesEl.textContent = totalSlides;

    // Create slide indicators
    slides.forEach((slide, index) => {
        const indicator = document.createElement('div');
        indicator.className = 'slide-indicator' + (index === 0 ? ' active' : '');
        indicator.addEventListener('click', () => goToSlide(index + 1));
        indicatorsContainer.appendChild(indicator);
    });

    // Navigation buttons
    prevBtn.addEventListener('click', () => {
        if (currentSlide > 1) goToSlide(currentSlide - 1);
    });

    nextBtn.addEventListener('click', () => {
        if (currentSlide < totalSlides) goToSlide(currentSlide + 1);
    });
}

function goToSlide(slideNumber) {
    const slides = document.querySelectorAll('.slide');
    const indicators = document.querySelectorAll('.slide-indicator');
    const currentSlideEl = document.getElementById('currentSlide');

    if (slideNumber < 1 || slideNumber > totalSlides) return;

    currentSlide = slideNumber;

    // Scroll to slide with smooth animation
    slides[slideNumber - 1].scrollIntoView({ behavior: 'smooth' });

    // Update indicators with animation
    indicators.forEach((indicator, index) => {
        indicator.classList.toggle('active', index === slideNumber - 1);
    });

    // Update counter with animation
    currentSlideEl.style.transform = 'translateY(-10px)';
    currentSlideEl.style.opacity = '0';

    setTimeout(() => {
        currentSlideEl.textContent = String(slideNumber).padStart(2, '0');
        currentSlideEl.style.transform = 'translateY(0)';
        currentSlideEl.style.opacity = '1';
    }, 150);

    updateButtonStates();
    updateProgressBar();
}

function updateButtonStates() {
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');

    prevBtn.style.opacity = currentSlide === 1 ? '0.3' : '1';
    prevBtn.style.pointerEvents = currentSlide === 1 ? 'none' : 'auto';
    nextBtn.style.opacity = currentSlide === totalSlides ? '0.3' : '1';
    nextBtn.style.pointerEvents = currentSlide === totalSlides ? 'none' : 'auto';
}

/* ============================================
   PROGRESS BAR
   ============================================ */
function initProgressBar() {
    updateProgressBar();
}

function updateProgressBar() {
    const progressFill = document.getElementById('progressFill');
    const progress = ((currentSlide) / totalSlides) * 100;
    progressFill.style.width = `${progress}%`;
}

/* ============================================
   KEYBOARD NAVIGATION
   ============================================ */
function initKeyboardNav() {
    document.addEventListener('keydown', (e) => {
        switch (e.key) {
            case 'ArrowRight':
            case 'ArrowDown':
                e.preventDefault();
                if (currentSlide < totalSlides) goToSlide(currentSlide + 1);
                break;
            case 'ArrowLeft':
            case 'ArrowUp':
                e.preventDefault();
                if (currentSlide > 1) goToSlide(currentSlide - 1);
                break;
            case ' ':
                e.preventDefault();
                toggleAutoPlay();
                break;
            case 'Home':
                e.preventDefault();
                goToSlide(1);
                break;
            case 'End':
                e.preventDefault();
                goToSlide(totalSlides);
                break;
            case 'f':
            case 'F':
                toggleFullscreen();
                break;
        }
    });
}

/* ============================================
   SCROLL OBSERVER
   ============================================ */
function initScrollObserver() {
    const slides = document.querySelectorAll('.slide');
    const indicators = document.querySelectorAll('.slide-indicator');
    const currentSlideEl = document.getElementById('currentSlide');

    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.5
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const slideNumber = parseInt(entry.target.dataset.slide);
                currentSlide = slideNumber;

                // Update indicators
                indicators.forEach((indicator, index) => {
                    indicator.classList.toggle('active', index === slideNumber - 1);
                });

                // Update counter
                currentSlideEl.textContent = String(slideNumber).padStart(2, '0');

                updateButtonStates();
                updateProgressBar();

                // Trigger slide animations
                triggerSlideAnimations(entry.target);
            }
        });
    }, observerOptions);

    slides.forEach(slide => observer.observe(slide));
}

/* ============================================
   SCROLL ANIMATIONS
   ============================================ */
function initScrollAnimations() {
    // Initial trigger for first slide
    const firstSlide = document.querySelector('.slide[data-slide="1"]');
    if (firstSlide) {
        setTimeout(() => triggerSlideAnimations(firstSlide), 500);
    }
}

function triggerSlideAnimations(slide) {
    const animateElements = slide.querySelectorAll('.animate-in');

    animateElements.forEach((el, index) => {
        const delay = parseInt(el.dataset.delay) || index * 100;

        setTimeout(() => {
            el.classList.add('visible');
        }, delay);
    });
}

/* ============================================
   COUNTER ANIMATIONS
   ============================================ */
function initCounters() {
    const counters = document.querySelectorAll('[data-value]');

    const observerOptions = {
        threshold: 0.5
    };

    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !entry.target.dataset.animated) {
                entry.target.dataset.animated = 'true';
                animateCounter(entry.target);
            }
        });
    }, observerOptions);

    counters.forEach(counter => counterObserver.observe(counter));
}

function animateCounter(element) {
    const target = parseFloat(element.dataset.value);
    const duration = 2000;
    const startTime = performance.now();
    const isDecimal = target % 1 !== 0;
    const isLargeNumber = target >= 10000;

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Easing function (ease-out cubic)
        const easeOut = 1 - Math.pow(1 - progress, 3);
        let current = target * easeOut;

        // Format based on number type
        if (isLargeNumber) {
            // Format as X.XM
            element.textContent = (current / 1000000).toFixed(1).replace('.0', '');
        } else if (isDecimal) {
            element.textContent = current.toFixed(1);
        } else {
            element.textContent = Math.floor(current).toLocaleString();
        }

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            // Final value
            if (isLargeNumber) {
                element.textContent = (target / 1000000).toFixed(1).replace('.0', '');
            } else if (isDecimal) {
                element.textContent = target.toFixed(1);
            } else {
                element.textContent = target.toLocaleString();
            }
        }
    }

    requestAnimationFrame(update);
}

/* ============================================
   AUTO PLAY
   ============================================ */
function initAutoPlay() {
    const autoPlayBtn = document.getElementById('autoPlayBtn');

    autoPlayBtn.addEventListener('click', toggleAutoPlay);
}

function toggleAutoPlay() {
    const autoPlayBtn = document.getElementById('autoPlayBtn');

    if (isAutoPlaying) {
        stopAutoPlay();
    } else {
        startAutoPlay();
    }

    autoPlayBtn.classList.toggle('playing', isAutoPlaying);
}

function startAutoPlay() {
    isAutoPlaying = true;

    autoPlayInterval = setInterval(() => {
        if (currentSlide < totalSlides) {
            goToSlide(currentSlide + 1);
        } else {
            goToSlide(1); // Loop back to start
        }
    }, 5000); // 5 seconds per slide
}

function stopAutoPlay() {
    isAutoPlaying = false;

    if (autoPlayInterval) {
        clearInterval(autoPlayInterval);
        autoPlayInterval = null;
    }
}

/* ============================================
   TIMELINE PROGRESS
   ============================================ */
function initTimelineProgress() {
    const timeline = document.getElementById('timelineProgress');
    if (!timeline) return;

    const processSlide = document.querySelector('.slide-process');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Animate timeline progress
                setTimeout(() => {
                    timeline.style.width = '100%';
                }, 500);
            }
        });
    }, { threshold: 0.5 });

    if (processSlide) {
        observer.observe(processSlide);
    }
}

/* ============================================
   FULLSCREEN
   ============================================ */
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.log('Fullscreen not available:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

/* ============================================
   KEYBOARD HINT
   ============================================ */
function hideKeyboardHint() {
    const hint = document.getElementById('keyboardHint');
    if (!hint) return;

    // Hide after 5 seconds
    setTimeout(() => {
        hint.style.opacity = '0';
        setTimeout(() => {
            hint.style.display = 'none';
        }, 500);
    }, 5000);
}

/* ============================================
   TOUCH SUPPORT
   ============================================ */
let touchStartY = 0;
let touchEndY = 0;
let touchStartX = 0;
let touchEndX = 0;

document.addEventListener('touchstart', (e) => {
    touchStartY = e.changedTouches[0].screenY;
    touchStartX = e.changedTouches[0].screenX;
}, { passive: true });

document.addEventListener('touchend', (e) => {
    touchEndY = e.changedTouches[0].screenY;
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
}, { passive: true });

function handleSwipe() {
    const swipeThreshold = 50;
    const diffY = touchStartY - touchEndY;
    const diffX = touchStartX - touchEndX;

    // Prioritize vertical swipes
    if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > swipeThreshold) {
        if (diffY > 0 && currentSlide < totalSlides) {
            goToSlide(currentSlide + 1);
        } else if (diffY < 0 && currentSlide > 1) {
            goToSlide(currentSlide - 1);
        }
    }
}

/* ============================================
   CURSOR GLOW EFFECT
   ============================================ */
(function initCursorGlow() {
    const glow = document.createElement('div');
    glow.className = 'cursor-glow';
    document.body.appendChild(glow);

    const style = document.createElement('style');
    style.textContent = `
        .cursor-glow {
            position: fixed;
            width: 400px;
            height: 400px;
            background: radial-gradient(circle, rgba(99, 102, 241, 0.08), transparent 60%);
            pointer-events: none;
            z-index: 1;
            transform: translate(-50%, -50%);
            transition: opacity 0.3s ease;
            opacity: 0;
        }
        .cursor-glow.visible {
            opacity: 1;
        }
    `;
    document.head.appendChild(style);

    let mouseX = 0, mouseY = 0;
    let glowX = 0, glowY = 0;

    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        glow.classList.add('visible');
    });

    document.addEventListener('mouseleave', () => {
        glow.classList.remove('visible');
    });

    // Smooth follow
    function updateGlow() {
        glowX += (mouseX - glowX) * 0.1;
        glowY += (mouseY - glowY) * 0.1;

        glow.style.left = glowX + 'px';
        glow.style.top = glowY + 'px';

        requestAnimationFrame(updateGlow);
    }
    updateGlow();
})();

/* ============================================
   PRELOADER (Optional)
   ============================================ */
window.addEventListener('load', () => {
    document.body.classList.add('loaded');

    // Trigger first slide animations
    const firstSlide = document.querySelector('.slide[data-slide="1"]');
    if (firstSlide) {
        triggerSlideAnimations(firstSlide);
    }
});
