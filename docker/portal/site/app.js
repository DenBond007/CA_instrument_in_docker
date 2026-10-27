(() => {
  'use strict';

  const toolDefinitions = [
    { id: 'mermaid', name: 'Mermaid Live Editor', description: 'Диаграммы из текста с живым предпросмотром', category: 'diagrams', label: 'Диаграммы', icon: 'workflow', keywords: 'мермейд схемы sequence flowchart последовательность' },
    { id: 'plantuml', name: 'PlantUML', description: 'UML-схемы и диаграммы последовательности', category: 'diagrams', label: 'Диаграммы', icon: 'git-branch', keywords: 'плант uml sequence классы' },
    { id: 'drawio', name: 'draw.io', description: 'Блок-схемы и архитектура в визуальном редакторе', category: 'diagrams', label: 'Диаграммы', icon: 'pencil-ruler', keywords: 'drawio дравио схемы архитектура bpmn' },
    { id: 'swagger-editor', name: 'Swagger Editor', description: 'Создание и редактирование OpenAPI-контрактов', category: 'api', label: 'API и контракты', icon: 'braces', keywords: 'сваггер openapi yaml json rest редактор' },
    { id: 'swagger-ui', name: 'Swagger UI', description: 'Просмотр документации вашего OpenAPI', category: 'api', label: 'API и контракты', icon: 'book-open', keywords: 'сваггер openapi документация спецификация' },
    { id: 'asyncapi', name: 'AsyncAPI Studio', description: 'События, сообщения и асинхронные контракты', category: 'api', label: 'API и контракты', icon: 'radio', keywords: 'асинхронные kafka брокер события сообщения' },
    { id: 'kroki', name: 'Kroki', description: 'Локальное API для рендеринга диаграмм', category: 'services', label: 'Рендеринг', icon: 'image', keywords: 'кроки рендер svg png export экспорт' },
    { id: 'portainer', name: 'Portainer', description: 'Управление Docker · отдельный сервис', category: 'services', label: 'Администрирование', icon: 'container', keywords: 'портейнер докер контейнеры управление' }
  ];
  const categories = [
    { id: 'all', label: 'Все инструменты' },
    { id: 'diagrams', label: 'Диаграммы' },
    { id: 'api', label: 'API и контракты' },
    { id: 'services', label: 'Служебные' }
  ];
  const themes = ['system', 'light', 'dark'];
  const themeNames = { system: 'системная', light: 'светлая', dark: 'тёмная' };
  const themeIcons = { system: 'monitor', light: 'sun', dark: 'moon' };
  const themeButton = document.getElementById('theme-toggle');
  let theme = 'system';
  try {
    const saved = localStorage.getItem('analyst-portal-theme');
    if (themes.includes(saved)) theme = saved;
  } catch { /* The page also works when browser storage is disabled. */ }
  function applyTheme() {
    document.documentElement.dataset.theme = theme;
    themeButton.setAttribute('aria-label', 'Сменить тему: ' + themeNames[theme]);
    themeButton.title = 'Тема: ' + themeNames[theme];
    themeButton.querySelector('use').setAttribute('href', '/icons.svg#' + themeIcons[theme]);
  }
  applyTheme();
  themeButton.addEventListener('click', () => {
    theme = themes[(themes.indexOf(theme) + 1) % themes.length];
    applyTheme();
    try { localStorage.setItem('analyst-portal-theme', theme); } catch { /* Optional preference. */ }
  });

  const config = window.__ANALYST_PORTAL_CONFIG__;
  let tools;
  try {
    if (config?.version !== 1 || typeof config.title !== 'string' || !config.title.trim() ||
        typeof config.host !== 'string' || !config.host || !config.tools || typeof config.tools !== 'object') {
      throw new Error('Invalid portal configuration');
    }
    tools = toolDefinitions.flatMap(definition => {
      const url = config.tools[definition.id];
      if (definition.id === 'portainer' && url === undefined) return [];
      if (typeof url !== 'string') throw new Error('Missing tool URL');
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Invalid tool URL');
      return [{ ...definition, url: parsed.href, port: parsed.port || (parsed.protocol === 'https:' ? '443' : '80') }];
    });
  } catch {
    document.getElementById('configuration-error').hidden = false;
    return;
  }

  document.title = config.title;
  document.getElementById('portal-title').textContent = config.title;
  document.getElementById('portal-host').textContent = config.host;
  const search = document.getElementById('tool-search');
  const grid = document.getElementById('tools');
  const categoryNav = document.getElementById('categories');
  let selectedCategory = 'all';

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('icon');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '/icons.svg#' + name);
    svg.append(use);
    return svg;
  }
  const cards = tools.map(tool => {
    const card = node('article', 'tool-card');
    card.dataset.tool = tool.id;
    const heading = node('div', 'tool-top');
    const mark = node('div', 'tool-icon');
    mark.append(icon(tool.icon));
    heading.append(mark, node('span', 'port', ':' + tool.port));
    const bottom = node('div', 'tool-bottom');
    const link = node('a', 'open-link', 'Открыть');
    link.href = tool.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', 'Открыть ' + tool.name);
    link.append(icon('arrow-up-right'));
    bottom.append(node('span', 'tool-category', tool.label), link);
    card.append(heading, node('h3', '', tool.name), node('p', 'tool-description', tool.description), bottom);
    grid.append(card);
    return { card, tool, searchText: [tool.name, tool.description, tool.label, tool.keywords].join(' ').toLocaleLowerCase('ru') };
  });
  const categoryButtons = categories.map(category => {
    const button = node('button', 'filter', category.label);
    button.type = 'button';
    button.dataset.category = category.id;
    button.setAttribute('aria-pressed', String(category.id === selectedCategory));
    const count = tools.filter(tool => category.id === 'all' || tool.category === category.id).length;
    button.append(node('span', 'category-count', String(count)));
    button.addEventListener('click', () => { selectedCategory = category.id; filter(); });
    categoryNav.append(button);
    return button;
  });
  function filter() {
    const terms = search.value.trim().toLocaleLowerCase('ru').split(/\s+/).filter(Boolean);
    let count = 0;
    for (const { card, tool, searchText } of cards) {
      const matching = (selectedCategory === 'all' || tool.category === selectedCategory) && terms.every(term => searchText.includes(term));
      card.hidden = !matching;
      if (matching) count++;
    }
    categoryButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.category === selectedCategory)));
    document.getElementById('section-title').textContent = categories.find(category => category.id === selectedCategory).label;
    document.getElementById('result-count').textContent = 'Показано: ' + count;
    document.getElementById('empty-state').hidden = count !== 0;
    grid.hidden = count === 0;
  }
  search.addEventListener('input', filter);
  document.getElementById('reset-search').addEventListener('click', () => {
    search.value = '';
    selectedCategory = 'all';
    filter();
    search.focus();
  });
  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    const editing = event.target instanceof HTMLElement && (event.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName));
    if (event.key === '/' && !editing) { event.preventDefault(); search.focus(); }
    if (event.key === 'Escape' && document.activeElement === search) { search.value = ''; filter(); }
  });
  filter();
  document.getElementById('catalog').hidden = false;
})();
