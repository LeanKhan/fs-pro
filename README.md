
<p align="center" width="100%">
    <img width="33%" src="https://fspro-cdn.sturves.tech/logo-new.png">
</p>

## FSPro Football Simulator
Pre general release version

FSPro is a football simulation game, still in progress but already you can:
- create seasons
- play matches
- argue with your brother about who _actually_ won the league...

─=≡Σ((( つ o3o)つ

This is a monorepo, combining the old [server](https://github.com/LeanKhan/fs-pro-server) and [client](https://github.com/LeanKhan/fs-pro-client) repos.

---

### Project top-level directory structure

```
apps
    ├── fs-pro-client                #  Webapp
    ├── fs-pro-server                #  Server and Game Engine

```

### To get started with FSPro
- You should have a MongoDB database
- Clone/Fork the repository locally
- Create the .env files in server and client root folders following their respective .env.example (include the database connection string here)
- Create the /assets directory in the root of apps/fs-pro-server and extract the contents of this zip file [FSPro Assets April 2024](https://drive.google.com/file/d/11AyWVmjn4uA0ImA1a3L_7KSR8NPHmlFb/view?usp=sharing) into it
- Install all dependencies, by running `npm i` in the root. We use npm >16
- When that's done, you can run `turbo build` then `turbo dev`
- FSPro should be running! Quick go to localhost:8080

### You can find sample data for your DB and information on how to play on our new docs site: https://fspro.sturves.tech/


## What's next?
- Migrate fs-pro-client from Vue 2 to Vue 3
- General refactoring
- Allow any clubs and any leagues. Right now, clubs and leagues are hardcoded. This should change...
- Improve the Game Engine. It has a lot of issues. If you notice any please let us know and you can help fix it :D
- Player Transfers
- ... lots of other things. I'd like to host this in the medium future. But not sure how that would look from an architectural standpoint, let's discuss if you have ideas.

We are open to any kind of contributions whether it's code, tips, suggestions, designs etc. We dey!

## Licensing

### Code

The code in this repository is licensed under the [MIT License](LICENSE).

### Images

Images such as club logos, player kits and any FSPro Brand assets are licensed under the [Creative Commons Attribution 4.0 International License](IMAGES_LICENSE.md). Meaning you can use them however you want, but it'll be nice if you point back to us >.<

### Club Names, Places, People

Not licensed but attribute :)