CITY HALL WATCHER LIVE: HISTORICAL ARCHIVE PROJECT

PROBLEM: Journalist Matt Elliott has provided live coverage of Toronto City Council meetings since ~2011. Through 2022, this coverage was exclusively on Twitter. Since 2023 (or so) it's also been posted to Bluesky.

This coverage collectively provides a valuable historical record, but it is hard to track down meeting coverage for a specific meeting. In addition, recent changes to X/Twitter have made it so it's hard for people to view posts while logged out. Plus some people just don't want to use Twitter/X anymore. (Relatable.)

SOLUTION: We have already built CITY HALL WATCHER LIVE - a tool that collects Matt's Bluesky posts during live coverage. The app has support for viewing old threads. We can leverage and expand this app to include an archive of all old meeting threads.

USEFUL FILES: (Included in project)

- /council-dates: Open Data files listing the dates of all Council & committee meetings for each term. Note that Council meetings span multiple days. I do one thread for each Council meeting, continuing the thread across each day of coverage.

- /bluesky-twitter-archive: Archives of posts from my Twitter and Bluesky accounts.  A tweets.js file contains the text of my Twitter posts. The bluesky archive is a CAR file. 

PROCESS:

Let's separate our job into individual tasks: 
 1) THE BLUESKY ERA: Should be relatively simple. Using the Schedule data in /council-dates, we should be able to find thread-starting posts that coincide with the dates of council meetings. (Make sure we're taking time zones into account). If automating this proves problematic, Matt can manually go back and find the thread-starters but hoping we can accelerate/simplify the process.
 
 Our app already has functionality to import Bluesky threads. Currently, though, a thread needs to be imported as a "live thread" then archived — It would be ideal if we built some sort of way to import directly into the archive.
 
 2) THE TWITTER ERA: Way more complicated. Unlike Bluesky, some of my coverage here predates threaded-post functionality. We'll need to look for ALL tweets that match the dates of Council meetings between 2010 to 2022. We'll also likely need a way to filter out posts from those days that aren't coverage tweets. 
 
 KEY QUESTIONS:
 
 1) Permanency. I want to make sure these are permanent archives that could conceivably outlast the end of the platforms (X/Bluesky) they're pulled from.  How do we ensure that?
 2) UI. Right now the /archives page is pretty plain. We'll want to think about ways to display the dates of meetings to make it more dynamic/interactive.
 3) Extended features. Can users search the complete archive? Can they find all posts that ref an individual councillor? Can we use LLM analysis to generate a quick summary of the major points of each meeting to make it easier to find relevant coverage? 