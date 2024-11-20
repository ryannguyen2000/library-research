import Link from "next/link";
import React from "react";

const Photo = () => {
  const photos = Array.from({ length: 6 }, (_, i) => i + 1);

  return (
    <section className="cards-container">
      {photos.map((id) => (
        <Link className="card" key={id} href={`/photos/${id}`} passHref>
          {id}
        </Link>
      ))}
    </section>
  );
};

export default Photo;
