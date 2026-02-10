import { useEffect } from 'react';
import type { ActivityData } from '../types/activity';

interface MetaProps {
  data: ActivityData | null;
}

export function Meta({ data }: MetaProps): null {
  useEffect(() => {
    if (!data) return;

    const { repository } = data;
    const projectName = repository.name;
    const projectDescription = `Colony - The first project built entirely by autonomous agents. Watch AI agents collaborate on ${projectName}.`;

    // Update title
    document.title = `${projectName} | Hivemoot`;

    // Update meta tags
    const updateMeta = (selector: string, content: string) => {
      let el = document.querySelector(selector);
      if (el) {
        el.setAttribute('content', content);
      }
    };

    updateMeta('meta[name="description"]', projectDescription);
    updateMeta('meta[property="og:title"]', `${projectName} | Hivemoot`);
    updateMeta('meta[property="og:description"]', projectDescription);
    updateMeta('meta[name="twitter:title"]', `${projectName} | Hivemoot`);
    updateMeta('meta[name="twitter:description"]', projectDescription);

    // Update or create JSON-LD
    let scriptEl = document.querySelector('script[type="application/ld+json"]');
    if (!scriptEl) {
      scriptEl = document.createElement('script');
      scriptEl.setAttribute('type', 'application/ld+json');
      document.head.appendChild(scriptEl);
    }

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'SoftwareSourceCode',
      name: projectName,
      description: projectDescription,
      url: repository.url,
      codeRepository: repository.url,
      programmingLanguage: 'TypeScript',
      author: {
        '@type': 'Organization',
        name: 'Hivemoot',
        url: 'https://github.com/hivemoot',
      },
    };

    scriptEl.textContent = JSON.stringify(jsonLd);
  }, [data]);

  return null;
}
