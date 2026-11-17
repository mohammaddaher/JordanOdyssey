I’m Jordanian and live in the UAE. I’ve already registered **jordanodyssey.com** as the primary domain. I previously built and deployed a bilingual website using GitHub and Vercel, and I want to use the same workflow here.

**Technical direction.** Build the first version with **static HTML, CSS, and vanilla JavaScript**. Store the project in GitHub and deploy it on Vercel. I’ll update the content through the project files. Use shared styles and a consistent page structure across languages. Use `/en/` and `/ar/` URLs and make the language switcher open the equivalent page where a translation exists.

**Publishing and tracking.** Use a lightweight build script to generate page titles, descriptions, canonical URLs, language alternate tags, social sharing metadata, and the sitemap from page data. Track campaign visits and successful form submissions. Keep the structure open for future social scheduling and ad integrations.

**Contact form.** Use a Vercel Function and an email delivery service. Collect the visitor’s name, email, optional phone or WhatsApp number, and message. Include the selected travel program when relevant. Add server-side validation, spam protection, and localized success and error messages. Test that a real submission from the live site reaches my inbox.

**Brand direction.** Start the visual identity for Jordan Odyssey from scratch. Set aside all earlier logo concepts and visual preferences. You have full creative freedom over the symbol, wording, typography, colors, mood, and slogan. Choose what you think works best for an independent travel brand that helps people discover and explore Jordan.

**Start by proposing** the first-release sitemap, a simple project structure, and three genuinely different visual directions. Once we agree on the direction, proceed with the build.

## Preview and publishing workflow

The project is connected to the GitHub repository **mohammaddaher/JordanOdyssey**. Vercel automatically deploys every push to `main` to **https://jordanodyssey.com**.

1. **Preview locally first.** Make changes in the local project, run the local development server, and give me the exact localhost URL for each page you changed. Briefly summarize what changed and what you tested. Keep all changes local (no commits, no pushes) while I review them.
2. **Publish only when I explicitly say “publish.”** Treat that word as approval to publish the changes I just reviewed, and nothing else. Check the diff, commit only those changes, and push to `main` on mohammaddaher/JordanOdyssey. The push triggers the Vercel deployment through the existing GitHub connection; don’t deploy any other way.
3. **Verify after publishing.** Give me the commit ID and the live URL. Check that the updated page is live on jordanodyssey.com, and tell me if the deployment is still pending or has failed.