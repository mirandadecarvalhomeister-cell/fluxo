// Helper para montar uma pergunta: enunciado, resposta certa e três erradas.
export const q = (question, correct, ...wrong) => ({ question, correct, wrong });
