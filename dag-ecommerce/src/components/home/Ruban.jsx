import { BUCKLES, FINISHES, LEATHERS, MONOGRAM_STYLES } from '../../data/atelier';
import { Marquee } from '../ui';

// Le vocabulaire de la maison, tiré du nuancier : une teinte de cuir, puis une finition, une boucle ou un marquage.
const GESTES = [...FINISHES, ...BUCKLES, ...MONOGRAM_STYLES].map((entry) => entry.name);
const WORDS = LEATHERS.flatMap((leather, index) => [
  { key: `cuir-${leather.id}`, label: leather.name, hex: leather.hex },
  { key: `geste-${index}`, label: GESTES[index % GESTES.length] },
]);

/** Ruban : les mots de l'atelier défilent lentement, comme une respiration entre deux chapitres. */
export default function Ruban() {
  return (
    <div className="theme-noir border-y border-line">
      <Marquee speed={26} gap="2.5rem" fade aria-hidden="true" className="py-4 md:py-5">
        {WORDS.map((word) => (
          <span key={word.key} className="flex items-center gap-10 whitespace-nowrap">
            {word.hex ? (
              <span className="flex items-center gap-3 font-display text-[1.375rem] leading-none md:text-[1.625rem]">
                <span
                  className="size-2.5 rounded-full shadow-[inset_0_0_0_1px_rgb(241_235_225/0.3)]"
                  style={{ backgroundColor: word.hex }}
                />
                {word.label}
              </span>
            ) : (
              <span className="font-display text-[1.375rem] italic leading-none text-muted md:text-[1.625rem]">{word.label}</span>
            )}
            <span className="h-px w-6 bg-line" />
          </span>
        ))}
      </Marquee>
    </div>
  );
}
