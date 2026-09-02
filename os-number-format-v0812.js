/* VoxAssist — padrão oficial de OS interna: DD + letra do mês + AA + letra da hora + MM.
   Mês: A=Jan ... H=Ago ... L=Dez (índice do mês, 0-based -- confere:
   19/08 é mês índice 7 -> 65+7='H', bate com o exemplo original).
   Hora: 08h=A, 09h=B, 10h=C, 11h=D, 12h=E, 13h=F, 14h=G, 15h=H, 16h=I,
   17h=J, 18h=K, 19h=L, 20h=M, 21h=N -- deslocamento a partir das 08h,
   não a hora absoluta.
   Ex.: 02/09/2026 14:35 => 02I26G35.

   Achado do usuário em 2026-09-02 (P0): a hora usava
   fromCharCode(65+hora) direto (hora ABSOLUTA -- comentário antigo
   dizia "A=00h...X=23h", mas essa nunca foi a regra oficial), gerando
   14h='O' em vez do 'G' correto. Corrigido pra usar o deslocamento
   hora-8, conforme a tabela oficial.

   Fora do intervalo 08h-21h (antes de abrir ou depois de fechar): a
   regra oficial só define letra pra esse intervalo -- nunca inventa
   uma letra fora dele. Usa 'Z' como marcador explícito de "fora do
   horário operacional" (nunca colide com A-N, a faixa real) até haver
   uma definição oficial pra esse caso. */
(function(){
  window.genOsNumber = function(){
    const d = new Date();
    const dd = String(d.getDate()).padStart(2,'0');
    const monthLetter = String.fromCharCode(65 + d.getMonth());
    const yy = String(d.getFullYear()).slice(-2);
    const hour = d.getHours();
    const withinOperatingHours = hour >= 8 && hour <= 21;
    const hourLetter = withinOperatingHours ? String.fromCharCode(65 + (hour - 8)) : 'Z';
    const mm = String(d.getMinutes()).padStart(2,'0');
    return `${dd}${monthLetter}${yy}${hourLetter}${mm}`;
  };
})();