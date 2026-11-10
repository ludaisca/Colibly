// Conversaciones de ejemplo (solo lectura). Un WAChat exige una cuenta, así que
// no se guardan en la base de datos: son este fixture, que se muestra con la
// etiqueta "Ejemplo, no es un chat real". Spa Aurora, CDMX.

export interface SampleMessage {
  from: "cliente" | "bot" | "equipo";
  text: string;
  time: string;
}

export interface SampleConversation {
  id: string;
  contact: string;
  preview: string;
  messages: SampleMessage[];
}

export const SAMPLE_CONVERSATIONS: SampleConversation[] = [
  {
    id: "ejemplo-mariana",
    contact: "Mariana López",
    preview: "¡Listo! Te agendé el sábado a las 11:00.",
    messages: [
      { from: "cliente", text: "Hola, ¿tienen lugar para un facial el sábado?", time: "10:02" },
      { from: "bot", text: "¡Hola, Mariana! Sí, el sábado tenemos lugar a las 11:00 y a las 13:00. El facial hidratante cuesta $850 y dura una hora. ¿Cuál horario te acomoda?", time: "10:02" },
      { from: "cliente", text: "Sí, a las 11 porfa", time: "10:04" },
      { from: "bot", text: "¡Listo! Te agendé el sábado a las 11:00. Te mando recordatorio un día antes 💆‍♀️", time: "10:04" },
    ],
  },
  {
    id: "ejemplo-carlos",
    contact: "Carlos Ruiz",
    preview: "Quedamos entonces para el masaje descontracturante.",
    messages: [
      { from: "cliente", text: "Buenas tardes, ¿cuánto cuesta el masaje descontracturante?", time: "16:20" },
      { from: "bot", text: "¡Buenas tardes, Carlos! El masaje descontracturante de 60 minutos cuesta $1,200. ¿Quieres que te busque un lugar esta semana?", time: "16:20" },
      { from: "cliente", text: "Mejor el jueves por la tarde", time: "16:25" },
      { from: "equipo", text: "Hola Carlos, soy Paola del spa. El jueves tengo libre a las 17:00. Quedamos entonces para el masaje descontracturante.", time: "16:31" },
    ],
  },
];
