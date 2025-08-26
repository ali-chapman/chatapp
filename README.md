# Offline Chat App

This implementation is still a bit buggy but has the foundations from which
a feature complete version of this project could be completed. At a high level,
sending messages (online and offline) works, but group management isn't working.

## Requirements

* **Users should be able to add and remove chat groups**
  Not fully working, if a user creates a group online then there is still issues which
  synchronizing the localId correctly so "Loading Messages" shows until the page is refreshed.
  If a user creates a group offline, then it isn't sync'ed properly when reconnecting. I also
  didn't have time to add a "remove group" button.

* **Users should be able to send messages to individual chat groups**
  This works, both online and offline.

* **Users should be able to join any available chat groups**
  This works, although there is a display bug where if user A joins a group, then user B doesn't
  see this updated in the "Members: " display until they refresh the page.

* **If I am offline I should still be able to perform the same set of operations, when I come back online
  I then receive any backlog of messages that are waiting for me**
  Like I mentioned above, this all works for messaging and joining groups, the big issues are still in creating
  groups.

## Conflict Resolution

I had planned to make the conflict resolution strategies configurable by an admin, but I
didn't have time to implement this.

### Offline message ordering

In this scenario:
1. Alice is offline, and sends a message M1 to a group
2. Bob is online, and sends a message M2 to the same group
3. When Alice comes back online, everyone will see the messages in the order M1, M2.

Making this configurable would be mostly a backend change, with a small change to how the messages are rendered in the UI.

## Running this App

`docker compose up -d`
