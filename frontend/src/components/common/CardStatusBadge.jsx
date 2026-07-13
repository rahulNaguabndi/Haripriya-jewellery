export default function CardStatusBadge({ cardGiven, cardReturned }) {
  if (!cardGiven) return <span className="badge badge-card-none">No Card Issued</span>;
  if (!cardReturned) return <span className="badge badge-card-pending">Card Given — Pending Return</span>;
  return <span className="badge badge-card-returned">Card Returned</span>;
}
