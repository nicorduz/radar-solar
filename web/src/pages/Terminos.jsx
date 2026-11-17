// Compatibilidad: los términos ahora se leen del servidor (server/legal/terminos.md) y se muestran con Legal.jsx
import React from 'react';
import Legal, { LegalLine } from './Legal.jsx';

export { LegalLine };
export default function Terminos() { return <Legal doc="terminos" />; }
