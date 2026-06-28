export interface SpecialDay {
  name: string;
  month: number;
  day: number;
}

const SPECIAL_DAYS: SpecialDay[] = [
  { name: 'Dia do Consumidor', month: 3, day: 15 },
  { name: 'Dia das Maes', month: 5, day: 11 },
  { name: 'Dia dos Namorados', month: 6, day: 12 },
  { name: 'Dia dos Pais', month: 8, day: 11 },
  { name: 'Black Friday', month: 11, day: 28 },
  { name: 'Cyber Monday', month: 12, day: 1 },
  { name: 'Natal', month: 12, day: 25 },
];

// 01/01, 02/02... 12/12 — datas-espelho que viralizam no Brasil
for (let i = 1; i <= 12; i++) {
  SPECIAL_DAYS.push({
    name: `${String(i).padStart(2, '0')}/${String(i).padStart(2, '0')}`,
    month: i,
    day: i,
  });
}

export function isSpecialDay(date: Date = new Date()): boolean {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return SPECIAL_DAYS.some(d => d.month === month && d.day === day);
}

export function getTodaySpecialDay(date: Date = new Date()): SpecialDay | undefined {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return SPECIAL_DAYS.find(d => d.month === month && d.day === day);
}
