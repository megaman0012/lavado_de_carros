import React from 'react';

/**
 * Logotipo de Total Clean Car: la gota con el auto + "TOTAL / CLEAN CAR".
 * Fuente: docs/lavadodecarro.png. La marca (gota) es imagen; el texto se dibuja
 * con Montserrat para que se vea nítido a cualquier tamaño.
 *
 * - variante "color": para fondos claros (TOTAL en azul oscuro, CLEAN CAR en azul claro)
 * - variante "blanco": para fondos con el degradado de marca o el menú oscuro
 */
interface Props {
  variante?: 'color' | 'blanco';
  tamano?: 'sm' | 'md' | 'lg';
  soloMarca?: boolean;
  className?: string;
}

const MEDIDAS = {
  sm: { marca: 'h-8', total: 'text-base', clean: 'text-[10px]' },
  md: { marca: 'h-10', total: 'text-xl', clean: 'text-xs' },
  lg: { marca: 'h-16', total: 'text-3xl', clean: 'text-base' }
};

const Logo: React.FC<Props> = ({ variante = 'color', tamano = 'md', soloMarca = false, className = '' }) => {
  const m = MEDIDAS[tamano];
  const blanco = variante === 'blanco';
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <img
        src={`${process.env.PUBLIC_URL}/brand/${blanco ? 'logo-mark-white.png' : 'logo-mark.png'}`}
        alt={soloMarca ? 'Total Clean Car' : ''}
        className={`${m.marca} w-auto`}
      />
      {!soloMarca && (
        <span className="font-marca leading-none flex flex-col">
          <span className={`${m.total} font-extrabold tracking-wide ${blanco ? 'text-white' : 'text-marca-oscuro'}`}>TOTAL</span>
          <span className={`${m.clean} font-medium tracking-[0.12em] ${blanco ? 'text-white/90' : 'text-marca-claro'}`}>CLEAN CAR</span>
        </span>
      )}
    </span>
  );
};

export default Logo;
