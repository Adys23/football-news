import { FEED_PATH } from "@/lib/public/paths";
import { SITE } from "@/lib/site";

/**
 * Autodiscovery feedu RSS. Element, a nie `metadata.alternates.types`: metadata laczy
 * sie plytko, wiec `alternates.canonical` strony nadpisalby link z layoutu. React
 * przenosi `<link>` do `<head>`.
 */
export function FeedLink() {
  return <link rel="alternate" type="application/rss+xml" title={SITE.name} href={FEED_PATH} />;
}
