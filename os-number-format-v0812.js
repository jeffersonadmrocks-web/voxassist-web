/* VoxAssist — padrão oficial de OS interna: DD + letra do mês + AA + letra da hora + MM.
   Mês: A=Jan ... H=Ago ... L=Dez. Hora: A=00h, B=01h ... X=23h.
   Ex.: 19/08/2026 05:18 => 19H26F18. */
(function(){
  window.genOsNumber = function(){
    const d = new Date();
    const dd = String(d.getDate()).padStart(2,'0');
    const monthLetter = String.fromCharCode(65 + d.getMonth());
    const yy = String(d.getFullYear()).slice(-2);
    const hourLetter = String.fromCharCode(65 + d.getHours());
    const mm = String(d.getMinutes()).padStart(2,'0');
    return `${dd}${monthLetter}${yy}${hourLetter}${mm}`;
  };
})();