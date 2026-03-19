const heroImage = document.getElementById('hero-image');
const heroUniversityName = document.getElementById('hero-university-name');
const heroUniversityCopy = document.getElementById('hero-university-copy');
const heroUniversityList = document.getElementById('hero-university-list');

if (heroImage && heroUniversityName && heroUniversityCopy && heroUniversityList) {
  const universities = [
    {
      name: 'Universiti Malaya',
      code: 'UM',
      description: "Malaysia's oldest university and a major reference point for many applicants.",
      image:
        'https://images.unsplash.com/photo-1498243691581-b145c3f54a5a?auto=format&fit=crop&w=1400&q=80',
    },
    {
      name: 'Universiti Putra Malaysia',
      code: 'UPM',
      description: 'Known for strong agriculture, science, engineering, and applied research programmes.',
      image:
        'https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=1400&q=80',
    },
    {
      name: 'Universiti Kebangsaan Malaysia',
      code: 'UKM',
      description: 'A broad public university with strong national reach across many disciplines.',
      image:
        'https://commons.wikimedia.org/wiki/Special:FilePath/Langkawi%20Malaysia%20Universiti-Kebangsaan-Malaysia-01.jpg',
    },
    {
      name: 'Universiti Sains Malaysia',
      code: 'USM',
      description: 'A major research university with established health, science, and technology faculties.',
      image:
        'https://commons.wikimedia.org/wiki/Special:FilePath/Main%20gate%20at%20the%20Universiti%20Sains%20Malaysia.jpg',
    },
    {
      name: 'Universiti Teknologi Malaysia',
      code: 'UTM',
      description: 'Popular for engineering and technical pathways across a large campus network.',
      image:
        'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=1400&q=80',
    },
  ];

  let activeIndex = 0;
  let tickerIntervalId = null;

  function renderUniversityList() {
    heroUniversityList.innerHTML = '';

    universities.forEach((university, index) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `home-hero-university-pill${index === activeIndex ? ' active' : ''}`;
      item.textContent = university.code;
      item.setAttribute('aria-label', `Show ${university.name}`);
      item.addEventListener('click', () => {
        activeIndex = index;
        updateHero();
        restartTicker();
      });
      heroUniversityList.appendChild(item);
    });
  }

  function updateHero() {
    const activeUniversity = universities[activeIndex];
    heroImage.style.backgroundImage = `url("${activeUniversity.image}")`;
    heroUniversityName.textContent = activeUniversity.name;
    heroUniversityCopy.textContent = activeUniversity.description;
    renderUniversityList();
  }

  function tickHero() {
    activeIndex = (activeIndex + 1) % universities.length;
    updateHero();
  }

  function restartTicker() {
    if (tickerIntervalId) {
      clearInterval(tickerIntervalId);
    }
    tickerIntervalId = setInterval(tickHero, 5000);
  }

  updateHero();
  restartTicker();
}
