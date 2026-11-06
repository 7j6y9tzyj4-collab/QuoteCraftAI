// 💼 Іконки нижнього меню для бізнес-стилю (лінійні, без емодзі).
const P:Record<string,string>={
  home:"M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  calc:"M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm1 3v4h10V5zm0 7h2m4 0h2m-8 4h2m4 0h2",
  saved:"M7 2h7l5 5v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 0v5h5M8.5 13h7m-7 4h5",
  pay:"M12 2v20M17 6.5C17 4.6 14.8 3.5 12 3.5S7 4.6 7 6.8s2.2 3 5 3.7 5 1.6 5 3.8-2.2 3.3-5 3.3-5-1.2-5-3.1",
  clients:"M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm-8 9c.6-3.9 3.9-6.5 8-6.5s7.4 2.6 8 6.5",
  prices:"M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7 7 0 0 1-1.7 1l-.3 2H11l-.3-2a7 7 0 0 1-1.7-1l-1.9.7-2-3.4 1.6-1.2a7 7 0 0 1 0-3L5.1 9.3l2-3.4 1.9.7a7 7 0 0 1 1.7-1l.3-2h4l.3 2a7 7 0 0 1 1.7 1l1.9-.7 2 3.4-1.6 1.2a7 7 0 0 1 0 3z",
};
export default function NavIcon({k}:{k:string}){
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={P[k]||P.home}/></svg>;
}
