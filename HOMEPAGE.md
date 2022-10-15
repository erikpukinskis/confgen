# ✨Ambic✨ is Polyrepo Nirvana

Monoliths are overwhelming.

Microservices are chaos.

**Ambic** combines the best of both worlds, by providing **patterns** and **tooling** that makes it a snap to maintain a Polyrepo architecture in the JavaScript ecosystem.

## Table of contents

- [Comparison to other approaches](#comparison-to-other-approaches)
- [How Ambic does it](#how-ambic-does-it)
- [The Ambic Way](#the-ambic-way)

## Comparison to other approaches

<table>
<tr>
  <th></th>
  <th>Monolith</th>
  <th>Microservices</th>
  <th>Monorepo</th>
  <th>Polyrepo<br/>+</br>✨Ambic✨</th>
<tr>
  <td><b>Small modules</b></td>
  <td>❌</td>
  <td>✅</td>
  <td>✅</td>
  <td>✅</td>
</tr>
<tr>
  <td><b>Good separation of concerns</b></td>
  <td>❌</td>
  <td>✅</td>
  <td>⚠️</td>
  <td>✅</td>
</tr>
<tr>
  <td><b>Fast development tasks</b></td>
  <td>❌</td>
  <td>✅</td>
  <td>⚠️</td>
  <td>✅</td>
</tr>
<tr>
  <td><b>Well documented internal APIs</b></td>
  <td>❌</td>
  <td>⚠️</td>
  <td>⚠️</td>
  <td>✅</td>
</tr>
<tr>
  <td><b>No mocking and stubbing</b></td>
  <td>✅</td>
  <td>❌</td>
  <td>✅</td>
  <td>❌</td>
</tr>
<tr>
  <td><b>No versioning hell</b></td>
  <td>✅</td>
  <td>❌</td>
  <td>✅</td>
  <td>⚠️</td>
</tr>
<tr>
  <td><b>Consistency between modules</b></td>
  <td>✅</td>
  <td>❌</td>
  <td>⚠️</td>
  <td>✅</td>
</tr>
<tr>
  <td><b>Shared configuration</b></td>
  <td>✅</td>
  <td>❌</td>
  <td>❌</td>
  <td>✅</td>
</tr>
<tr>
  <td><b>Minimal complexity</b></td>
  <td>✅</td>
  <td>⚠️</td>
  <td>⚠️</td>
  <td>⚠️</td>
</tr>
</table>

It should be clear from that table there are fundamental tradeoffs between monorepos, monoliths, and microservices. The friction you get between isolated repositories on the one hand can create inconsistency, and on the other hand creates pressure to separate and document concerns. It can slow down integration while speeding up local development.

Ambic doesn't solve every problem above, but solves some of them, and it deliberately chooses what kind of friction we want to keep. And that starts with a commitment to the **Polyrepo** architecture. Like microservices, a Polyrepo architecture moves isolated modules into their own repositories. But Ambic mitigates the downsides of microservices...

## How Ambic does it

Ambic uses three basic principles to achieve Polyrepo Nirvana:

1. **One language to rule them all** — the entire stack is TypeScript
2. **All repos are configured the same** - `ambic confgen` automatically configures libraries for you
3. **Locked in tools** — Ambic tames JavaScript Churn™ by commiting to a set of mature JavaScript technologies that won't change.

Let's dig into more detail...

### TypeScript All The Things

Ambic is **all-in on TypeScript**. Listen. You have to choose a programming language. None of them are perfect. There's always a best tool for the job. However, we think that a lot of architects underestimate the huge cost of going from **one language to two**. TypeScript is the only language that can provide a solid B-tier development experience both in browsers and on the server. So we use it everywhere.

This goes beyond just the basic programming language, we use TypeScript absolutely everywhere we can:

- We don't use CSS, we use CSS-in-TS
- We don't use markdown for documentation, we use TSX with a _great_ set of simple helper components
- We write our command line tools in TypeScript too

As a result, _every_ coder who is working on an Ambic application has a fighting chance at reading and understand and contributing to _every_ part of the codebase. This makes for **faster context switching** and **more engaged collaboration** between different types of devs.

### Convention Over Configuration

Ambic is committed to standardizing as much as possible about application architecture. This means standard code organization (library code in `lib/`, application code in `app/`, server code in `server/`). It means standard testing libraries (Vitest) and commands across repos (`yarn test`, `yarn build`, `yarn validate`). It means a standard documentation format (Code Docs).

This model is obviously inspired by Rails, where it is a major part of [The Rails Doctrine](https://rubyonrails.org/doctrine#convention-over-configuration).

We think it has enabled Rails to be a successful long-term asset to many companies, and we think after many years of experimenting the JavaScript world is finally ready for it. While new paradigms like Svelte, serverless, Web3, etc have come along and will continue to come along, we believe that we have entered the **age of diminishing returns** for web application ergonomics.

We think several technologies have proven their power and maturity and we're committing to them for the long haul:

- **TypeScript** adds the safety and ergonomics JavaScript badly needed
- **React** adds the DOM performance and simplified control flow that had plagued frontend code
- **SQL** has provided clean abstraction of persisted data that has survived a serious challenges from NoSQL and other persistence models
- **GraphQL** adds relations and contracts that made REST endpoints brittle and complex to coordinate
- **Esbuild** and **Vite** have made major steps beyond the slowness and configuration hell that Babel and Webpack left us with
- **CSS-in-JS** allows colocation of scripts and styles and a simplified build pipeline over other CSS models

And yes, we know that something better will come along to replate all of these. But, like the Rails organization, Ambic is committed to putting convention first. And like Rails, we will move beyond these paradigms when it becomes overwhelmingly obvious that a change is needed. But we will do so only when it's clear we absolutely must. And we will do it in a major release, with all of the tooling and documented required to make it a smooth transition.

### Powerful tools

All of these lofty ideals are just words. Ambic achieves the consistency and ergonomics of Polyrepo Nirvana

**`ambic confgen`** configures every repo in a consistent way: code organization, builds, tests, packaging, etc

**`ambic propagate`** creates a tree of PRs from one. When you make a change to one repo, it generates PRs in all of the dependent repos so you can kick off tests and understand the implications of a change.

# The Ambic Way

## In the beginning....

Once upon a time, the norm for organizing the codebase for a large application was **\*The Monolith**. Codebases like this would have a single repository, usually with many modules contained inside. Similar modules would share utilities, and build infrastructure.

The monolith approach causes some unique pain:

### A. Modules can grow very large without anyone noticing

This can lead to very complex parts of the application that are difficult to reason about. A common example is the Router of a large app. It pulls in functions from potentially hundreds of different pages and endpoints and integrates them together.

### B. Modules can become tightly coupled

It's really easy in a monolith to have logic in one module that relies on undocumented internals of another module to function. You might have UI components that assume an API response has a very specific shape. It's easy to continue this state of affairs because you can change both of those parts of the codebase together in a single PR. But it makes it difficult to reason about modules, because there is poor separation of concerns.

### C. Development tasks are slow

The test suite is big. The linter has a lot of code to lint. This slows people down.

### D. Internal APIs are undocumented

You write a new API in one module, use it in another, merge the code and move on to the next task. It's not usually clear how, where, or when to document internal APIs and so there is often little to no documentation.

## Enter Microservices

Fed up with unwieldy monoliths, and desiring the sweet sweet taste of _separation of concerns_ a new philosophy was branded **Microservices**. Instead of throwing modules into one giant repo together, each module gets its own repo. Each has its own suite of tests, and its own build tooling. Applications are split into _microapplications_ each of which has its own backend. Different repos can use entirely different stacks, languages, and patterns.

This means individual packages can be small and understandable. Tests run fast. but this comes with its own headaches:

### E. Mocking and stubbing are a problem

Individual services do depend on each other. If my Application depends on my API Server, then the API Server needs to be either mocked or stubbed or spun up in order to run the Application test suite. Writing good mocks is hard work. And they are never 100% realistic. Spinning up instances of adjacent services is often slow and complicated.

### F. Versioning hell

Once you publish a change to one module, now you have to propagate that change to every other module. You probably then have to run more tests and do another round of reviews. This slows down integration.

### G. Creeping inconsistency

Now that individual modules can pick the right tool for the job, that also means patterns and knowledge from one module don't transfer to another. One service can be written in Node while another is in Go. They can have different linting rules. They can have different ways of running tests. This makes it hard for devs to switch between different modules.

### H. Duplication of effort

Every new module has to re-invent the wheel on some level. You have to reconfigure build processes, CI processes, linting, etc. You have to integrate third party services again and again. This is a real cost.

## The Mono*repo* saves the day?

In order to tame the complexity of microservices, tooling for **Monorepos** was invented. Lerna. Turborepo. These tools make it easy to have many _separate_ modules in one single repo. Unlike The Monolith, code can't be organized willy-nilly. Everything is a "package". But modules can reference each other directly in an unversioned way. Some configuration can be shared at the root. Modules can directly load each other up in tests.

Sounds perfect, but there are still challenges:

### C. Some development tasks are _still_ slow

When you push up a PR you still have to run the entire dang test suite. Because it's easy for modules to depend on each other, many development tasks will still require you to configure and spin up many services to test things out.

### G. Creeping inconsistency

### H. Duplication of effort

... these are still challenges. Multiple packages still need to configure their own builds, their own linting. They can and do organize code differently.

### B. Modules can become tightly coupled

### D. Internal APIs are undocumented

It's still easy to import code directly from one module into another, or to presume implementation details of one in another. You don't need to mock, stub, document, or version APIs in order to share them between modules.

### I. More tools, more complexity

Monorepos require their own suite of tools and the complexity that comes with them.

## Why Ambic chose the Polyrepo model

It should be clear by now that there are fundamental tradeoffs here. The friction you get between isolated repositories on the one hand can create inconsistency, and on the other hand creates pressure to separate and document concerns. It can slow down integration while speeding up local development.

**Ambic** doesn't solve every problem above, but solves some of them, and it deliberately chooses what kind of friction we want to keep. And that starts with a commitment to the **Polyrepo** architecture. Like microservices, a Polyrepo architecture moves isolated modules into their own repositories. And it mitigates the downsides of microservices by...

1. Standardizing conventions across repos
2. Adding tools to manage versioning and propagation of releases
3. Adding tools to encourage documentation-by-default

There is still friction with this setup, but we think it is the best of both worlds. You get the development speed of a microservices architecture with the integration speed of a monorepo and the consistency of a monolith.

So let's be clear. Ambic's Polyrepo approach accepts several weaknesses:

### E. Mocking and stubbing are a problem

We think this is a good tradeoff. Yes, mocking, stubbing, and spinning up adjacent services takes time and effor. But we think it's necessary to achieve good separation of concerns. And Ambic mitigates the pain in several ways:

- **Consistent conventions across repos** make integration easier. Application tests can trivially embed a backend because the backend is written in Node.
- **Repos can easily consume each other.** The Ambic tools make it trivial to export JavaScript functions from one repo to another. It just has to be versioned and documented, which we think is a good thing.

### F. Versioning hell

If you have poly-repos, then you have to do poly-releases. That's inevitable. Ambic also mitigates this pain though:

- **`ambic propagate`** makes propagating a release to dependent packages a single `yarn` command away. There can still be integration issues to address, but much of the busy work is eliminated.

### I. More tools, more complexity

Compared to a Monolith, there is still tooling here to learn, and complexity to deal with. In our opinion, this is just the cost that goes hand-in-hand with faster build times and genuine separation of concerns. Ambic mitigates this by:

- Having great tools. We work hard on ergonomics and documentation. We do usability testing. We iterate on the design of our tooling.

### Centralize best practices

As of today, Ambic provides conventions and turn-key tooling for...

- Building libraries and applications
- Package publishing
- Linting
- Code formatting
- Testing
- Schema sharing
- Documentation

But of course application and library developers will encounter additional architecture problems that need solving. Work Servers, Queues, Data Synchronization, Caching, etc may all be key challenges that span repos and draw our attention.

Ambic is not meant to completely solve every software challenge an app developer might come across. We still believe in the power of the distributed JavaScript ecosystem. There are many problems left to solve. While we hold convention and consistency as a core value, we think it's important to allow for heterogeneity on the horizons of JavaScript architecture.

However, Ambic is committed to standardizing libraries and best practices in cases where:

1. Those best practices allow smoother integration _across repos_, and
2. It [uses boring technology](https://mcfunley.com/choose-boring-technology), libraries which have gone through several major revisions and being successfully integrated in many mature applications.

To this end, Ambic has three branches of development:

**`stable`** is the latest long term service releas

**`next`** contains breaking changes under consideration for the next major release

**`future`** is a playground for the latest and greatest technologies, which may not meet the two criteria listed above.

## Other possible names:

Multix
Repow
Polya
Ambic
Corpo
Socia
Varit
Repox
Reep
Repon
Repoi
Polyweb
