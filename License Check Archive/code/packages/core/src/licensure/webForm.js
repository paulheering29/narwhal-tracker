const decode = (text) =>
  text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const attribute = (tag, name) => {
  const found = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return found ? (found[1] ?? found[2]) : null;
};

/**
 * Every field of a page's form, as a browser would send it back: the hidden
 * ones a server uses to keep its place, each text box's current value, and the
 * chosen option of each list. Buttons are left out -- which one was pressed is
 * the caller's to say.
 *
 * The state sites that make you click through several pages before a download
 * hand a fresh set of these hidden fields to every page, and want them back
 * exactly. Reading them off each page, rather than remembering any, is what
 * keeps the download from breaking when the site reshuffles them.
 *
 * @param {string} html
 * @returns {Record<string, string>}
 */
export function formFields(html) {
  const fields = {};

  for (const [tag] of html.matchAll(/<input\b[^>]*>/gi)) {
    const name = attribute(tag, 'name');
    const type = (attribute(tag, 'type') ?? 'text').toLowerCase();
    if (!name || ['submit', 'button', 'reset', 'image', 'file'].includes(type)) continue;
    if ((type === 'checkbox' || type === 'radio') && !/\bchecked\b/i.test(tag)) continue;
    fields[name] = decode(attribute(tag, 'value') ?? '');
  }

  for (const [, name, body] of html.matchAll(/<select\b[^>]*\bname\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/select>/gi)) {
    const options = [...body.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)];
    const chosen = options.find(([, attrs]) => /\bselected\b/i.test(attrs)) ?? options[0];
    if (chosen) fields[name] = decode(attribute(chosen[1], 'value') ?? chosen[2].trim());
  }

  return fields;
}
