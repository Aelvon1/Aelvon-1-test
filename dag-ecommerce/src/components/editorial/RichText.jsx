import { TextLink } from '../ui';

function Inline({ parts }) {
  if (typeof parts === 'string') return parts;
  return parts.map((part, index) =>
    typeof part === 'string' ? (
      part
    ) : (
      <TextLink key={index} to={part.to} href={part.href} underline="always" tone="fg">
        {part.label}
      </TextLink>
    ),
  );
}

/**
 * Rend une réponse de l'aide (voir faq-content.js) : paragraphes, liens et listes de définitions.
 * @param {{ blocks: Array<string|Array|{ terms: Array<[string, string]> }> }} props
 */
export default function RichText({ blocks = [] }) {
  return (
    <div className="flex flex-col gap-4">
      {blocks.map((block, index) =>
        block.terms ? (
          <dl key={index} className="grid gap-x-6 gap-y-1.5 sm:grid-cols-[7rem_minmax(0,1fr)]">
            {block.terms.map(([term, text]) => (
              <div key={term} className="contents">
                <dt className="font-medium text-fg">{term}</dt>
                <dd className="max-sm:mb-2">{text.charAt(0).toUpperCase() + text.slice(1)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p key={index}>
            <Inline parts={block} />
          </p>
        ),
      )}
    </div>
  );
}
