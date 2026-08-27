import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Droplets, Clock, MapPin, ShieldCheck, CalendarCheck, LogIn } from 'lucide-react';
import api from '../services/api';
import { TipoServicio } from '../types';

const Landing: React.FC = () => {
  const [servicios, setServicios] = useState<TipoServicio[]>([]);

  useEffect(() => {
    api.get('/public/servicios')
      .then((res) => setServicios(res.data))
      .catch(() => setServicios([]));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Droplets className="text-sky-600" size={28} />
            <span className="font-bold text-xl text-slate-800">Lavado<span className="text-sky-600">Carros</span></span>
          </div>
          <Link to="/login" className="flex items-center gap-2 text-sm bg-sky-600 text-white px-4 py-2 rounded-lg hover:bg-sky-700">
            <LogIn size={16} /> Ingresar
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-sky-500 to-blue-700 text-white">
        <div className="max-w-6xl mx-auto px-4 py-20 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Tu auto limpio mientras está estacionado
          </h1>
          <p className="text-lg text-sky-100 mb-8 max-w-2xl mx-auto">
            Reserva online y nuestro equipo lava tu vehículo en tu estacionamiento,
            sin supervisión y sin que te muevas. También limpieza profunda en bahía.
          </p>
          <Link
            to="/reservar"
            className="inline-flex items-center gap-2 bg-white text-sky-700 font-semibold px-8 py-3 rounded-xl hover:bg-sky-50 transition"
          >
            <CalendarCheck size={20} /> Reservar ahora
          </Link>
        </div>
      </section>

      {/* Ventajas */}
      <section className="max-w-6xl mx-auto px-4 py-14 grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { icon: <MapPin size={28} />, titulo: 'Vamos a tu estacionamiento', texto: 'Edificios, condominios y empresas. Tú dejas el carro, nosotros lo lavamos.' },
          { icon: <Clock size={28} />, titulo: 'Agenda en tiempo real', texto: 'Elige fecha y hora; las franjas ocupadas aparecen bloqueadas.' },
          { icon: <ShieldCheck size={28} />, titulo: 'Sin supervisión', texto: 'Personal capacitado y evidencia del trabajo realizado.' }
        ].map((v, i) => (
          <div key={i} className="bg-white rounded-2xl p-6 shadow-sm text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-sky-100 text-sky-600 mb-4">
              {v.icon}
            </div>
            <h3 className="font-semibold text-lg text-slate-800 mb-2">{v.titulo}</h3>
            <p className="text-sm text-slate-500">{v.texto}</p>
          </div>
        ))}
      </section>

      {/* Catálogo de servicios */}
      <section className="max-w-6xl mx-auto px-4 pb-16">
        <h2 className="text-2xl font-bold text-slate-800 mb-6 text-center">Nuestros servicios</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {servicios.map((s) => (
            <div key={s.id} className={`bg-white rounded-2xl p-6 shadow-sm border-t-4 ${s.modalidad === 'profunda' ? 'border-purple-500' : 'border-sky-500'}`}>
              <span className={`text-xs font-semibold uppercase tracking-wide ${s.modalidad === 'profunda' ? 'text-purple-600' : 'text-sky-600'}`}>
                {s.modalidad === 'profunda' ? 'En bahía · traes tu carro' : 'Expreso · vamos al sitio'}
              </span>
              <h3 className="font-semibold text-lg text-slate-800 mt-1">{s.nombre}</h3>
              <p className="text-sm text-slate-500 mt-1 min-h-[40px]">{s.descripcion}</p>
              <div className="flex items-center justify-between mt-4">
                <span className="text-2xl font-bold text-slate-800">${s.precio.toFixed(2)}</span>
                <span className="text-xs text-slate-400 flex items-center gap-1"><Clock size={14} /> {s.duracion_min} min</span>
              </div>
              <Link
                to="/reservar"
                state={{ servicioId: s.id }}
                className="mt-4 block text-center bg-sky-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-sky-700"
              >
                Reservar
              </Link>
            </div>
          ))}
        </div>
      </section>

      <footer className="bg-slate-900 text-slate-400 text-center py-6 text-sm">
        © 2026 LavadoCarros — Sistema de reservas de lavado
      </footer>
    </div>
  );
};

export default Landing;
