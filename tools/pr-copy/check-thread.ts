const SUBREDDIT = "threadsifttests";

const CREATED = 1_700_000_000;

const QUESTION =
  "Our nightly sync job keeps stalling after the cache folder fills up. Does anyone know why?";

function wireComment(id: string, parent: string, body: string, replies: readonly object[] = []) {
  return {
    kind: "t1",
    data: {
      id,
      author: `reader_${id}`,
      body,
      parent_id: parent,
      score: 3,
      created_utc: CREATED + 60,
      replies: replies.length === 0 ? "" : { kind: "Listing", data: { children: replies } },
    },
  };
}

function postListing(id: string, tag: string) {
  return {
    kind: "Listing",
    data: {
      children: [
        {
          kind: "t3",
          data: {
            id,
            title: `Nightly sync stalls ${tag}`,
            author: "author_one",
            subreddit: SUBREDDIT,
            selftext: QUESTION,
            created_utc: CREATED,
            num_comments: 3,
          },
        },
      ],
    },
  };
}

function commentListing(id: string) {
  return {
    kind: "Listing",
    data: {
      children: [
        wireComment(
          "c1",
          `t3_${id}`,
          "I agree with the question. I have wondered about this as well and I am glad someone asked.",
          [
            wireComment(
              "c2",
              "t1_c1",
              "The stall comes from the inode limit, not the disk size. After I ran tune2fs -i 1024 on the cache volume the nightly sync finished in 4 minutes, so the conclusion is to raise the inode count of the cache volume.",
            ),
          ],
        ),
        wireComment(
          "c3",
          `t3_${id}`,
          "Have you tried turning it off and on again? That always works in my house, haha.",
        ),
      ],
    },
  };
}

export function authoredThread(tag: string) {
  const id = `ts${tag}`;

  return {
    url: `https://www.reddit.com/r/${SUBREDDIT}/comments/${id}/nightly_sync_stalls/`,
    content: JSON.stringify([postListing(id, tag), commentListing(id)]),
  };
}
