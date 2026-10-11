export default function CardStatusBadge({ cardGiven, cardReturned }) {
  if (!cardGiven) return <span className="badge badge-card-none">No card issued</span>;
  if (!cardReturned) return <span className="badge badge-card-pending">Card given · not returned</span>;
  return <span className="badge badge-card-returned">Card returned</span>;
}
