import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Landing from './pages/Landing';
import Reservar from './pages/Reservar';
import MisReservas from './pages/MisReservas';
import Agenda from './pages/Agenda';
import Reservas from './pages/Reservas';
import Clientes from './pages/Clientes';
import Estacionamientos from './pages/Estacionamientos';
import Servicios from './pages/Servicios';
import Lavadores from './pages/Lavadores';
import Reportes from './pages/Reportes';
import MisTrabajos from './pages/MisTrabajos';
import Planes from './pages/Planes';

const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Público */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/reservar" element={<Reservar />} />

          {/* Cliente autenticado */}
          <Route path="/mis-reservas" element={
            <ProtectedRoute roles={['cliente', 'admin', 'operador']}>
              <Layout><MisReservas /></Layout>
            </ProtectedRoute>
          } />

          {/* Lavador autenticado */}
          <Route path="/mis-trabajos" element={
            <ProtectedRoute roles={['lavador']}>
              <Layout><MisTrabajos /></Layout>
            </ProtectedRoute>
          } />

          {/* Panel interno */}
          <Route path="/agenda" element={
            <ProtectedRoute roles={['admin', 'operador', 'lavador']}>
              <Layout><Agenda /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/reservas" element={
            <ProtectedRoute roles={['admin', 'operador']}>
              <Layout><Reservas /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/dashboard" element={
            <ProtectedRoute roles={['admin', 'operador']}>
              <Layout><Reportes resumen /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/clientes" element={
            <ProtectedRoute roles={['admin', 'operador']}>
              <Layout><Clientes /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/estacionamientos" element={
            <ProtectedRoute roles={['admin', 'operador']}>
              <Layout><Estacionamientos /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/servicios" element={
            <ProtectedRoute roles={['admin', 'operador']}>
              <Layout><Servicios /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/lavadores" element={
            <ProtectedRoute roles={['admin', 'operador']}>
              <Layout><Lavadores /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/reportes" element={
            <ProtectedRoute roles={['admin', 'operador']}>
              <Layout><Reportes /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/planes" element={
            <ProtectedRoute roles={['admin', 'operador']}>
              <Layout><Planes /></Layout>
            </ProtectedRoute>
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
