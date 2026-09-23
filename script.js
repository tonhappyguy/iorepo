document.addEventListener('DOMContentLoaded', () => {
  const yearNode = document.getElementById('year');
  if (yearNode) {
    yearNode.textContent = new Date().getFullYear();
  }

  const repoSourceCode = document.getElementById('repo-source-code');

  async function getRepoCatalog() {
    try {
      const response = await fetch('debrepo/repositories.json');
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.repos) && data.repos.length) return data.repos;
      }
    } catch (_error) {
      // ignore, then try GitHub API fallback
    }

    const githubBase = (() => {
      const pagesHost = window.location.hostname.match(/^([^.]+)\.github\.io$/);
      if (!pagesHost) return null;

      const owner = pagesHost[1];
      const pathParts = window.location.pathname.split('/').filter(Boolean);
      const repository = pathParts[0] && !pathParts[0].includes('.')
        ? pathParts[0]
        : `${owner}.github.io`;
      if (repository) return `https://api.github.com/repos/${owner}/${repository}/contents/debrepo`;
      return null;
    })();

    if (!githubBase) return [];

    try {
      const response = await fetch(githubBase);
      if (!response.ok) return [];
      const items = await response.json();
      if (!Array.isArray(items)) return [];

      return await Promise.all(items.filter((item) => item.type === 'dir' && item.name !== 'myrepo').map(async (item) => {
        let description = 'Репозиторий Cydia';
        let icon = '';
        let packageCount = 0;

        try {
          const descResponse = await fetch(`debrepo/${item.name}/description.txt`);
          if (descResponse.ok) {
            description = (await descResponse.text()).trim() || description;
          }
        } catch (_error) {
          // ignore
        }

        try {
          const iconResponse = await fetch(`debrepo/${item.name}/icon.png`);
          if (iconResponse.ok) {
            icon = `debrepo/${item.name}/icon.png`;
          }
        } catch (_error) {
          // ignore
        }

        try {
          const dataResponse = await fetch(`debrepo/${item.name}/repo-data.json`);
          if (dataResponse.ok) {
            const repoData = await dataResponse.json();
            packageCount = Array.isArray(repoData.packages) ? repoData.packages.length : 0;
          }
        } catch (_error) {
          // ignore
        }

        return {
          name: item.name,
          path: item.name,
          description,
          icon,
          package_count: packageCount,
        };
      }));
    } catch (_error) {
      return [];
    }
  }

  const repoListNode = document.getElementById('repo-list');
  if (repoListNode) {
    getRepoCatalog()
      .then(async (repos) => {
        if (repoSourceCode) {
          repoSourceCode.textContent = repos.length
            ? `deb ${new URL(`debrepo/${repos[0].path}/`, window.location.href).toString()} ./`
            : 'Добавьте папку репозитория в debrepo/, чтобы получить ссылку для Cydia.';
        }

        if (!repos.length) {
          repoListNode.innerHTML = '<p class="empty-state">Список репозиториев пуст.</p>';
          return;
        }

        const enrichedRepos = await Promise.all(repos.map(async (repo) => {
          try {
            const response = await fetch(`debrepo/${repo.path}/repo-data.json`);
            if (!response.ok) return { ...repo, firstDeb: '' };
            const repoData = await response.json();
            const firstDeb = Array.isArray(repoData.packages) && repoData.packages.length
              ? `debrepo/${repo.path}/${repoData.packages[0].path}`
              : '';
            return { ...repo, firstDeb };
          } catch (_error) {
            return { ...repo, firstDeb: '' };
          }
        }));

        repoListNode.innerHTML = enrichedRepos.map((repo) => {
          const icon = repo.icon || `debrepo/${repo.path}/icon.png` || 'https://placehold.co/80x80/f5f5f5/1f7a4f?text=Repo';
          const description = repo.description || 'Репозиторий Cydia';
          const repoUrl = `debrepo/${repo.path}/`;
          const repoPageUrl = `repo.html?repo=${encodeURIComponent(repo.path)}`;
          const repoLink = new URL(repoUrl, window.location.href).toString();
          const debSource = `deb ${repoLink} ./`;
          const debLink = repo.firstDeb ? new URL(repo.firstDeb, window.location.href).toString() : '';

          return `
            <article class="repo-item repo-card">
              <div class="repo-meta">
                <img src="${icon}" alt="${repo.name}" class="repo-icon" />
                <span class="repo-tag">${repo.package_count || 0} пакетов</span>
              </div>
              <strong>${repo.name}</strong>
              <p>${description}</p>
              <div class="repo-actions">
                <a class="button small primary" href="${repoPageUrl}">Открыть</a>
                <button class="button small copy-link" type="button" data-copy="${debSource}">Копировать</button>
                ${debLink ? `<a class="button small secondary" href="${debLink}" target="_blank" rel="noopener">.deb</a>` : ''}
              </div>
              <small>${debSource}</small>
            </article>
          `;
        }).join('');

        document.querySelectorAll('[data-copy]').forEach((button) => {
          button.addEventListener('click', async () => {
            const text = button.getAttribute('data-copy');
            try {
              await navigator.clipboard.writeText(text);
              const original = button.textContent;
              button.textContent = 'Готово';
              setTimeout(() => {
                button.textContent = original;
              }, 1200);
            } catch (_error) {
              window.prompt('Скопируйте строку для Cydia:', text);
            }
          });
        });
      })
      .catch(() => {
        repoListNode.innerHTML = '<p class="empty-state">Не удалось загрузить список репозиториев.</p>';
      });
  }

  const repoDetailNode = document.getElementById('repo-detail');
  if (repoDetailNode) {
    const params = new URLSearchParams(window.location.search);
    const repoParam = params.get('repo');

    getRepoCatalog()
      .then((repos) => {
        const repo = repos.find((item) => item.path === repoParam || item.name === repoParam);

        if (!repo) {
          repoDetailNode.innerHTML = `
            <div class="repo-page-shell">
              <a class="button secondary" href="repositories.html">← Назад</a>
              <div class="empty-state">Репозиторий не найден.</div>
            </div>
          `;
          return;
        }

        const icon = repo.icon || `debrepo/${repo.path}/icon.png` || 'https://placehold.co/80x80/f5f5f5/1f7a4f?text=Repo';
        const repoUrl = `debrepo/${repo.path}/`;
        const repoLink = new URL(repoUrl, window.location.href).toString();
        const cydiaSource = `deb ${repoLink} ./`;

        repoDetailNode.innerHTML = `
          <div class="repo-page-shell">
            <a class="button secondary" href="repositories.html">← Назад к репозиториям</a>
            <div class="repo-page-header">
              <img src="${icon}" alt="${repo.name}" class="repo-page-icon" />
              <div>
                <p class="eyebrow">Repository</p>
                <h1>${repo.name}</h1>
                <p class="repo-page-description">${repo.description || 'Репозиторий Cydia'}</p>
              </div>
            </div>
            <div class="repo-page-actions">
              <a class="button primary" href="${repoLink}" target="_blank" rel="noopener">Открыть репо</a>
              <button class="button secondary" type="button" data-copy="${cydiaSource}">Копировать deb-ссылку</button>
            </div>
            <div class="repo-page-box">
              <h3>Источник для Cydia</h3>
              <code>${cydiaSource}</code>
            </div>
          </div>
        `;

        document.querySelector('[data-copy]')?.addEventListener('click', async () => {
          const text = document.querySelector('[data-copy]').getAttribute('data-copy');
          try {
            await navigator.clipboard.writeText(text);
            const node = document.querySelector('[data-copy]');
            const original = node.textContent;
            node.textContent = 'Скопировано';
            setTimeout(() => {
              node.textContent = original;
            }, 1200);
          } catch (_error) {
            window.prompt('Скопируйте строку для Cydia:', text);
          }
        });
      })
      .catch(() => {
        repoDetailNode.innerHTML = '<div class="repo-page-shell"><a class="button secondary" href="repositories.html">← Назад</a><div class="empty-state">Ошибка загрузки данных репозитория.</div></div>';
      });
  }

  const licenseListNode = document.getElementById('license-list');
  if (licenseListNode) {
    fetch('licence.txt')
      .then((response) => {
        if (!response.ok) throw new Error('licence.txt not found');
        return response.text();
      })
      .then((text) => {
        const safeText = text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');

        licenseListNode.innerHTML = `
          <article class="license-card">
            <h3>Project Licence</h3>
            <pre class="license-text">${safeText}</pre>
            <div class="license-actions">
              <a class="button small primary" href="licence.txt" target="_blank" rel="noopener">Открыть файл</a>
            </div>
          </article>
        `;
      })
      .catch(() => {
        licenseListNode.innerHTML = '<p class="empty-state">Файл licence.txt не найден.</p>';
      });
  }
});
