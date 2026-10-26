export default function Ransom({ texto }: { texto: string }) {
  let k = 0;
  return (
    <h1 className="ransom" aria-label={texto}>
      {[...texto].map((ch, i) => {
        if (ch === " ") return <i key={i} className="sp" />;
        k++;
        return (
          <i key={i} className={"abcab"[(k - 1) % 5]} aria-hidden="true" style={{ transform: `rotate(${((k * 37) % 7) - 3}deg)` }}>{ch}</i>
        );
      })}
    </h1>
  );
}
