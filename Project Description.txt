CITY HALL WATCHER LIVE - CONCEPT & EXTENSION

PROBLEM STATEMENT: Matt Elliott is a journalist who covers Toronto City Council meetings. He produces long threads on Bluesky (formerly Twitter) covering the proceedings from beginning to end. These threads are very popular with people who want to stay current on local news. But the way Bluesky displays threads is not ideal for people who are not regular users of the platform, and long threads especially can be hard to follow.

SOLUTION: Creating a site (live.cityhallwatcher.com) that monitors a given thread and displays all posts, allowing people to check in and see the latest posts without having to track down the Bluesky thread.

CONCEPT DESIGN:
1. On the day of a Council meeting, Matt will access an admin page and provide a Bluesky URL indicating the start of a thread.

2. During the meeting, users will be able to go to live.cityhallwatcher.com and see the latest posts. Posts would be displayed in chronological order, with options to flip to reverse chronological, or the latest posts. Our app will need to check for new posts every X minutes 

3. After the end of the meeting (They span multiple days, so probably best way to indicate the end is for Matt to manually signal meeting end via admin page. Could also automatically 'end' a thread after more than 24 hours of inactivity), the whole thread should be archived and accessible via a URL like live.cityhallwatcher.com/april-2026 - viewable without logging in to Bluesky.

PROOF OF CONCEPT:
The project folder includes an html file that accepts a Bluesky URL and displays the thread content.

POTENTIAL ISSUES:
- Checking for new posts - how often? We want people viewing the coverage via the app to be current but don't want to run afoul of BlueSky API limits.
- Deleted posts - sometimes Matt makes mistakes and deletes posts, issuing new ones as a correction. How does our app handle this event?
- Deployment - this would need to run on a server so people can access. I have experience with Vercel/Railway - is that a good solution for this app, or is there something better?
- Admin functions - how to secure? Secret key?

FUTURE EXPANSION: 
- Matt has more than ten years of council coverage threads, mostly posted on Twitter/X. It would be good to find a way to import these threads into the archive

- Coverage regularly includes screenshots of vote results taken by Council. It would be cool if we could process these and replace them with an accessible text version.

- We could integrate the YouTube video of the meeting, allowing people to jump right to the timestamp of the YouTube video based on the timestamp of the Bluesky post. We could also integrate the YouTube transcripts

- Claude-generated summaries of the meetings, including topic tagging.