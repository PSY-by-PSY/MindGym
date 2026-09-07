# App Store Review Guidelines

**Last Updated**: 2026-09-06  
**Source**: [Official Apple Developer](https://developer.apple.com/app-store/review/guidelines/)

---

## Table of Contents

- [Introduction](#introduction)
- [Before You Submit](#before-you-submit)
- [1. Safety](#1-safety)
- [2. Performance](#2-performance)
- [3. Business](#3-business)
- [4. Design](#4-design)
- [5. Legal](#5-legal)
- [After You Submit](#after-you-submit)

---

## Introduction

The guiding principle of the App Store is simple—we want to provide a safe experience for users to get apps and a great opportunity for all developers to be successful. We do this by offering a highly curated App Store where every app is reviewed by experts and an editorial team helps users discover new apps every day. We also scan each app for malware and other software that may impact user safety, security, and privacy. These efforts have made Apple's platforms the safest for consumers around the world.

In some markets and on certain platforms, developers can also distribute notarized apps from alternative app marketplaces and directly from their website. Learn more about [alternative app marketplaces](https://developer.apple.com/documentation/marketplacekit/participating-in-alternative-distribution-for-specific-regions), [Web Distribution](https://developer.apple.com/documentation/marketplacekit/distributing-your-app-from-your-website), and [Notarization for iOS and iPadOS apps](https://developer.apple.com/help/app-store-connect/managing-alternative-distribution/submit-for-notarization).

### Key Points to Keep in Mind

- We have lots of kids and teens downloading apps—keeping them safe is critical. Ensure age-appropriate experiences.
- The App Store is for reaching hundreds of millions of people. For smaller audiences, use Xcode or Ad Hoc distribution.
- We support all points of view, as long as apps are respectful and high quality.
- Attempting to cheat the system will result in removal and expulsion from the Developer Program.
- You are responsible for all content in your app, including ad networks, analytics, and third-party SDKs.

---

## Before You Submit

### Pre-Submission Checklist

Make sure you:

- [ ] Test your app for crashes and bugs
- [ ] Ensure all app information and metadata is complete and accurate
- [ ] Update your contact information in case App Review needs to reach you
- [ ] Provide App Review with full access to your app
- [ ] Provide demo account or fully-featured demo mode if needed
- [ ] Enable backend services so they're live during review
- [ ] Include detailed explanations of non-obvious features and IAP in App Review notes
- [ ] Follow guidance in Developer, Design, and Brand/Marketing documentation

---

## 1. Safety

When people install an app from the App Store, they expect it to be safe. Your app must not contain upsetting or offensive content, damage their device, or cause physical harm.

### 1.1 Objectionable Content

Apps should not include:

- **1.1.1** Defamatory, discriminatory, or mean-spirited content targeting religion, race, sexual orientation, gender, nationality, or other groups
- **1.1.2** Realistic portrayals of people/animals being killed, maimed, tortured, or abused
- **1.1.3** Content encouraging illegal use of weapons or dangerous objects
- **1.1.4** Overtly sexual or pornographic material, hookup apps, or apps facilitating prostitution
- **1.1.5** Inflammatory religious commentary or inaccurate religious text quotations
- **1.1.6** False information, fake location trackers, anonymous/prank calls or SMS
- **1.1.7** Apps capitalizing on recent violence, terrorist attacks, or epidemics

### 1.2 User-Generated Content

Apps with UGC must include:

- Method for filtering objectionable material
- Mechanism to report content and timely responses
- Ability to block abusive users
- Published contact information

**Important**: You are responsible for removing violating content. Egregious behavior may result in app removal and Developer Program expulsion.

### 1.2.1 Creator Content

Apps featuring creator content must:

- Provide way for users to identify age-inappropriate content
- Use age restriction mechanism to limit access by minors

### 1.3 Kids Category

Apps in the Kids Category:

- Must NOT include links out, purchasing, or other distractions (unless behind parental gate)
- Must NOT include third-party analytics or advertising (limited exceptions)
- Must comply with children's privacy laws (COPPA, GDPR, etc.)
- Must NOT send personally identifiable information to third parties

### 1.4 Physical Harm

- **1.4.1** Medical apps: Must disclose data/methodology; cannot claim to measure blood pressure, temperature, glucose, or oxygen without validation
- **1.4.2** Drug dosage calculators: Must come from manufacturers, hospitals, or approved entities
- **1.4.3** No apps encouraging tobacco, vapes, illegal drugs, or excessive alcohol (especially to minors)
- **1.4.4** DUI checkpoints only from law enforcement; never encourage drunk driving
- **1.4.5** Apps should not encourage risky physical activities

### 1.5 Developer Information

- Include easy way to contact you in app and via Support URL
- Ensure wallet passes include valid issuer contact info

### 1.6 Data Security

Implement appropriate security to handle user information and prevent unauthorized access.

### 1.7 Reporting Criminal Activity

Apps for reporting crimes must involve local law enforcement and only operate where that involvement is active.

---

## 2. Performance

### 2.1 App Completeness

- **2.1(a)** Submissions must be final versions with all metadata and working URLs. No placeholder text or temporary content.
- **2.1(b)** All IAP must be complete, up-to-date, visible, and functional. Explain missing items in review notes.

### 2.2 Beta Testing

- Use TestFlight for beta distribution
- Apps should be intended for public distribution
- Cannot compensate testers

### 2.3 Accurate Metadata

Customers must know what they're getting:

- **2.3.1(a)** No hidden/undocumented features; clearly describe all functionality in review notes
- **2.3.1(b)** Don't mislead about features, content, or pricing
- **2.3.2** Clearly indicate which items require IAP
- **2.3.3** Screenshots show app in use, not just title/login screen
- **2.3.4** Previews show video screen captures (with optional narration/overlays)
- **2.3.5** Select appropriate category
- **2.3.6** Answer age rating questions honestly
- **2.3.7** Unique app name (max 30 chars), accurate keywords, no metadata stuffing
- **2.3.8** Metadata appropriate for 4+ rating, even if app rated higher
- **2.3.9** Secure rights to all icons/screenshots/previews; use fictional account data
- **2.3.10** Focus on Apple platform experience
- **2.3.11** Pre-order apps must be complete and deliverable as submitted
- **2.3.12** Clearly describe new features in "What's New"
- **2.3.13** In-app events must be accurate and happen at scheduled times

### 2.4 Hardware Compatibility

- **2.4.1** iPhone apps should run on iPad when possible
- **2.4.2** Use power efficiently; don't drain battery or generate excessive heat
- **2.4.3** Apple TV apps should work with Siri remote (enhanced with other peripherals ok)
- **2.4.4** Don't suggest/require device restart or unrelated system setting changes
- **2.4.5** Mac App Store apps: must be sandboxed, self-contained, no auto-launch, no third-party installers

### 2.5 Software Requirements

- **2.5.1** Use only public APIs; run on current OS; phase out deprecated features
- **2.5.2** Self-contained bundle; no external code execution (except educational code)
- **2.5.3** No malware, viruses, or code harming OS/hardware
- **2.5.4** Background services only for intended purposes
- **2.5.5** Fully functional on IPv6-only networks
- **2.5.6** Web apps must use WebKit; alternative engines need entitlement
- **2.5.8** No alternate desktop/home screen environments
- **2.5.9** Don't alter or disable standard switches (volume, ring/silent)
- **2.5.11** SiriKit/Shortcuts: handle only appropriate intents; accurate vocabulary
- **2.5.12** CallKit/SMS blocking: only block confirmed spam; clearly identify these features
- **2.5.13** Facial recognition: use LocalAuthentication; alternate auth for under 13
- **2.5.14** Request consent when recording/logging user activity
- **2.5.15** File selection should include Files app and iCloud documents
- **2.5.16** Widgets/extensions/notifications should relate to app content
- **2.5.17** Matter support must use Apple's framework
- **2.5.18** Display ads in main app only; limited to age rating; allow users to see targeting info

---

## 3. Business

### 3.1 Payments

#### 3.1.1 In-App Purchase

**Core Rule**: To unlock features/functionality, you must use IAP. No alternative mechanisms (license keys, QR codes, cryptocurrency, etc.).

- Subscriptions, in-game currencies, premium content, full versions → IAP
- Tipping developers/content creators → IAP allowed
- Consumable purchases may not expire; must have restore mechanism
- Gifting eligible for IAP; gifts refund to purchaser only
- "Loot boxes": must disclose odds before purchase
- Digital gift cards/vouchers/coupons → IAP only
- Non-subscription trials: "XX-day Trial" at Price Tier 0

#### 3.1.1(a) External Purchase Links

In limited regions, you may provide links to your website for purchasing (with StoreKit External Purchase Link Entitlements). **US storefront exception**: buttons/links to external purchases are allowed.

#### 3.1.2 Subscriptions

Auto-renewable subscriptions are permissible. Key requirements:

- **3.1.2(a)** Must provide ongoing value; minimum 7-day period
- Examples: new game levels, episodic content, updates, media access, SaaS
- Must work across all user devices
- Users shouldn't need to perform tasks (social posts, uploads, check-ins)
- Auto-renewable subscription apps may offer free trials
- **Apps changing to subscription model**: don't remove primary functionality users already paid for
- Cannot offer subscription under false pretenses (scam)

#### 3.1.2(b) Upgrades/Downgrades

Users need seamless experience; prevent accidental multiple subscriptions of same thing.

#### 3.1.2(c) Clear Information

Clearly describe what the user gets (issues/month, storage, access level, etc.).

#### 3.1.3 Other Purchase Methods

"Reader" apps (magazines, books, music, video) may link to developer's website for account management (with External Link Account Entitlement in specific regions).

Other exceptions:
- **3.1.3(b)** Multiplatform services: access content across platforms
- **3.1.3(c)** Enterprise services: employer/institution sales
- **3.1.3(d)** Person-to-person services: real-time tutoring, medical, etc. (One-to-many uses IAP)
- **3.1.3(e)** Physical goods/external services: use other payment methods
- **3.1.3(f)** Free standalone companion apps: no IAP needed
- **3.1.3(g)** Advertising management apps: no IAP needed

#### 3.1.4 Hardware-Specific Content

Limited cases: unlock without IAP if dependent on specific hardware (e.g., astronomy + telescope). Must also offer IAP option.

#### 3.1.5 Cryptocurrencies

- **Wallets**: allowed (organization enrolled only)
- **Mining**: only if off-device (cloud-based)
- **Exchanges**: only in licensed regions
- **ICOs/securities trading**: established financial institutions only
- Cannot offer currency for app downloads, social posts, etc.

### 3.2 Other Business Model Issues

#### 3.2.1 Acceptable

- Display your own apps for purchase/promotion
- Recommend collection of third-party apps for specific needs
- Disable access to rental content after expiration
- Wallet passes for payments/offers/ID
- Insurance apps: free, legal compliance
- Nonprofits: fundraise with Apple Pay; disclose fund usage
- Monetary gifts between individuals: optional, 100% to receiver
- Financial trading/investing/money management: submitted by institution with licensing

#### 3.2.2 Unacceptable

- General app store-like interface for third-party apps
- Artificially increase ad impressions/click-throughs
- Fundraise for charities (unless approved nonprofit)
- Arbitrarily restrict by location/carrier
- Binary options trading
- CFD/FOREX trading without proper licensing
- Personal loans: max 36% APR; no forced repayment in ≤60 days
- Force rate/review app or download other apps to access functionality

---

## 4. Design

### 4.1 Copycats

- Come up with original ideas
- Don't copy latest popular apps
- Don't impersonate other apps/services
- Can't use another developer's icon/brand/name without approval

### 4.2 Minimum Functionality

- App should elevate beyond repackaged website
- Provide lasting value or adequate utility
- Not just a song, movie, or book (submit to respective stores)

#### 4.2.1 ARKit

Provide rich, integrated AR experiences; don't just drop model into AR view.

#### 4.2.2 Catalogs/Marketing

Apps shouldn't primarily be marketing materials, ads, web clippings, or link collections.

#### 4.2.3 Self-Contained

- Work without requiring other apps
- If requires download, disclose size and prompt user

#### 4.2.6 Template-Generated Apps

Rejected unless submitted by content provider directly. Template providers should offer tools for customization.

#### 4.2.7 Remote Desktop Clients

If mirroring specific software:
- Connect to user-owned personal computer/game console
- Local/LAN network only
- Software executed on host device
- Account creation from host only
- Client UI shouldn't resemble iOS/App Store interface
- No app store browsing capability

### 4.3 Spam

- Don't create multiple Bundle IDs of same app (one worldwide + in-app variants)
- Don't submit indistinguishable apps
- Dating, flashlight, timer, wallpaper, fortune telling: must offer meaningfully different experience
- Drinking games, Kama Sutra, fart, burp apps: low-quality, may be removed

### 4.4 Extensions

Must follow Extension Programming Guide. Include functionality like help/settings. Clearly disclose extensions in marketing. No marketing/ads/IAP in extensions.

#### 4.4.1 Keyboard Extensions

**Must**:
- Provide keyboard input functionality
- Follow Sticker guidelines if includes images
- Provide method to progress to next keyboard
- Remain functional without full network/full access
- Collect activity only to enhance keyboard

**Must NOT**:
- Launch apps besides Settings
- Repurpose keyboard buttons for other behaviors

#### 4.4.2 Safari Extensions

- Run on current Safari version
- No interference with System/Safari UI
- No malicious/misleading content
- Only access websites strictly necessary

### 4.5 Apple Sites and Services

- **4.5.1** Use approved iTunes RSS feeds; don't scrape Apple sites
- **4.5.2(i)** MusicKit: Let users initiate playback; no payment/indirect monetization
- **4.5.2(ii)** Music integration needs direct licenses from rights-holders
- **4.5.2(iii)** Apple Music data: clearly disclose; no third-party sharing except app improvement
- **4.5.3** Don't spam via Game Center, Push Notifications, etc.
- **4.5.4** Push Notifications: not required for function; not for promotions without opt-in
- **4.5.5** Game Center Player IDs: use per terms; don't display to third parties
- **4.5.6** Emoji: may use Apple emoji in app/metadata (no other platforms)

### 4.7 Mini Apps, Mini Games, Streaming Games, Chatbots, Plug-ins, Game Emulators

You are responsible for all such software:

#### 4.7.1 Software Must

- Follow all privacy guidelines (including Guideline 5.1)
- Include method for filtering objectionable material
- Report mechanism and timely response to concerns
- Ability to block abusive users
- Follow Guideline 3.1 for digital goods/services

#### 4.7.2–4.7.5

- Don't expose native APIs without approval
- Explicit user consent for data/permissions per instance
- Provide index of all software with universal links
- Age restriction mechanism to limit access by minors

### 4.8 Login Services

If using third-party/social login (Facebook, Google, LinkedIn, WeChat, etc.) for primary account:

**Must also offer** equivalent login service that:
- Limits data to name/email
- Allows private email
- Doesn't collect app interactions for ads

**Exceptions**:
- Exclusive company account systems
- Alternative app marketplace (marketplace-specific login)
- Education/enterprise apps (existing account)
- Government/industry-backed citizen ID
- Client for third-party service (social, mail, etc.)

### 4.9 Apple Pay

- Provide all material purchase info before sale
- Use correct branding/UI per Apple Pay guidelines
- For recurring payments, disclose:
  - Renewal term length and auto-renewal until canceled
  - Services provided per period
  - Actual charges
  - How to cancel

### 4.10 Monetizing Built-In Capabilities

Cannot monetize built-in hardware/OS features (push notifications, camera, gyroscope) or Apple services (Apple Music access, iCloud, Screen Time APIs).

---

## 5. Legal

### 5.1 Privacy

Protecting user privacy is paramount. Use care when handling personal data; comply with privacy laws, Developer Program terms, and customer expectations.

#### 5.1.1 Data Collection and Storage

**5.1.1(i) Privacy Policies**:

Must include link in App Store Connect and within app. Policy must clearly:
- Identify data collected, how, and uses
- Confirm third parties have equal/same protection
- Explain data retention/deletion; describe how users can revoke consent/request deletion

**5.1.1(ii) Permission**:

- Collect with user consent (even anonymous data)
- Paid functionality NOT dependent on granting data access
- Provide easy way to withdraw consent
- Purpose strings describe use clearly
- GDPR/similar compliance

**5.1.1(iii) Data Minimization**:

- Only request data relevant to core functionality
- Use out-of-process picker or share sheet instead of full access

**5.1.1(iv) Access**:

- Respect user permissions; don't manipulate/trick
- Provide alternatives for users declining consent

**5.1.1(v) Account Sign-In**:

- If no significant account features, allow use without login
- Offer account deletion within app if account creation supported
- Don't require personal info except when directly relevant/by law
- If core functionality not related to social network, provide access without login
- Mechanism to revoke social network credentials
- Don't store social network credentials off-device

**5.1.1(vi)**: Developers surreptitiously discovering passwords removed from Developer Program

**5.1.1(vii)** SafariViewController: must be visible; can't be hidden/track without consent

**5.1.1(viii)**: Can't compile personal info from non-user sources without consent

**5.1.1(ix)**: Regulated fields (banking, healthcare, gambling, cannabis, crypto): submitted by legal entity providing services; cannabis apps geo-restricted

**5.1.1(x)** Basic contact info (name, email): optional; not conditional; complies with guidelines

#### 5.1.2 Data Use and Sharing

**5.1.2(i)**:

- No use/transmit/share personal data without permission
- Access info about data use/location
- Disclose third-party sharing; explicit permission
- Data may only be shared for app improvement or ads
- Explicit permission for tracking (App Tracking Transparency)
- Apps can't require system features enabled (push, location, tracking) for access

**5.1.2(ii)**: Data for one purpose can't be repurposed without consent

**5.1.2(iii)**: Don't build surreptitious user profiles; don't help identify anonymous users

**5.1.2(iv)**: Don't build contact database from Contacts/Photos APIs; don't collect installed app list for analytics

**5.1.2(v)**: Don't contact via Contacts/Photos except at user's explicit request (per contact, no Select All); describe message before sending

**5.1.2(vi)**: HomeKit, HealthKit, Clinical Health Records, ClassKit, depth/facial mapping (ARKit, Camera, Photos) data: can't use for marketing/ads/data mining

**5.1.2(vii)** Apple Pay data: only share to facilitate/improve goods/services

#### 5.1.3 Health and Health Research

Health data is especially sensitive:

**5.1.3(i)**:

- Can't disclose health/fitness/medical data (HealthKit, etc.) to third parties for ads/marketing/data mining (except improving health management or health research with permission)
- Can use health data to benefit user directly (e.g., reduced insurance premium) if app submitted by benefit provider; no third-party sharing

**5.1.3(ii)**: Don't write false data into HealthKit; can't store personal health info in iCloud

**5.1.3(iii)** Research consent must include:
- Nature, purpose, duration
- Procedures, risks, benefits
- Confidentiality/data handling (third-party sharing)
- Contact point
- Withdrawal process

**5.1.3(iv)** Research requires ethics board approval; provide proof upon request

#### 5.1.4 Kids

**5.1.4(a)**:

- Careful with kids' personal data; comply with COPPA, GDPR, etc.
- Ask birthdate/parental contact only for statutory compliance
- Include useful functionality regardless of age
- Kids apps: no third-party analytics/advertising
- In limited cases, with same terms as Guideline 1.3

**5.1.4(b)**:

- Kids Category apps collecting personal info: include privacy policy; comply with children's privacy statutes
- Parental gate ≠ parental consent for data collection
- Can't use "For Kids"/"For Children" in metadata unless in Kids Category

#### 5.1.5 Location Services

- Use Location Services when directly relevant
- Can't use for emergency services or autonomous control (except small devices/drones/toys)
- Notify and obtain consent before collecting/transmitting/using location
- Follow Human Interface Guidelines best practices

### 5.2 Intellectual Property

Only include content you created or licensed. Avoid common errors:

**5.2.1** Don't use protected third-party material (trademarks, copyrights, patents) without permission; avoid misleading/false representations

**5.2.2** If using third-party service content, ensure authorization per Terms of Use

**5.2.3** Audio/Video downloading: facilitate only with explicit authorization; check Terms of Use

**5.2.4 Apple Endorsements**:

- Don't imply Apple is source/supplier or endorses quality
- "Editor's Choice" badge applied automatically by Apple

**5.2.5 Apple Products**:

- Don't confusingly resemble Apple products/interfaces/apps
- Extensions can't include Apple emoji
- iTunes/Apple Music previews: only for music purposes; display link to iTunes/Apple Music
- Activity rings: don't visualize Move/Exercise/Stand data resembling Activity control
- Apple Weather data: follow attribution requirements

### 5.3 Gaming, Gambling, and Lotteries

Highly regulated; vet legal obligations everywhere and prepare for extra review time.

- **5.3.1** Sweepstakes/contests must be sponsored by app developer
- **5.3.2** Official rules must be presented; clarify Apple not involved
- **5.3.3** Can't use IAP for real-money gaming credit/currency
- **5.3.4** Real-money gaming/lotteries: licensing/permissions required; geo-restricted; free on App Store

### 5.4 VPN Apps

Must use NEVPNManager API; organization enrollment required.

- Clear data collection disclosure before purchase/use
- Can't sell/use/disclose data; must commit in privacy policy
- Must comply with local laws; provide license info if required in territory
- Non-compliant apps removed from App Store and Developer Program

### 5.5 Mobile Device Management

MDM apps must request capability from Apple.

- Commercial enterprises, educational institutions, government agencies, or parental control/device security companies only
- Clear data declaration before purchase/use
- Can't violate applicable laws
- Can't sell/use/disclose data; limited third-party analytics for MDM app performance only
- Non-compliant apps removed

### 5.6 Developer Code of Conduct

Treat everyone with respect. No harassment, discrimination, intimidation, or bullying.

- Customer trust is critical; never prey on users
- Don't trick into unwanted purchases or unnecessary data sharing
- Don't raise prices deceptively
- Don't charge for undelivered features
- No manipulative practices

#### 5.6.1 App Store Reviews

- Respond to customer reviews respectfully, targeted to comments
- No personal info, spam, or marketing in responses
- Use provided API for review prompts (no custom review prompts)

#### 5.6.2 Developer Identity

- Provide verifiable, truthful, relevant, up-to-date information
- Customers must understand who they're engaging with

#### 5.6.3 Discovery Fraud

- Don't manipulate charts, search, reviews, or referrals
- Integrity and customer trust are paramount

#### 5.6.4 App Quality

- Maintain high quality; excessive negative reviews or refund requests indicate quality concerns
- Inability to maintain quality may violate Developer Code of Conduct

---

## After You Submit

### Timing

App Review examines apps as soon as possible. Complex apps or those presenting new issues may require greater scrutiny. Repeated rejections or review process manipulation slow review.

### Status Updates

Track app status in App Store Connect.

### Expedite Requests

Can request expedited review for critical timing. Use sparingly—abuse may result in rejection of future requests.

### Release Date

If release date is set for future, app won't appear on App Store until that date, even if approved. Takes up to 24 hours to appear on all storefronts.

### Rejections

Goal: Apply guidelines fairly/consistently. If rejected, use App Store Connect to communicate with App Review team.

### Appeals

Disagree with review outcome? Submit appeal via App Store Connect. May also suggest guideline changes.

### Bug Fix Submissions

For already-approved apps, bug fixes not delayed for guideline violations (except legal/safety). If eligible, communicate via App Store Connect.

---

## 🎯 Pre-Submission Checklist for MindGym

Before sending your next build for review, verify:

- [ ] All content complies with Safety guidelines (1.1–1.7)
- [ ] App is complete, no crashes, all metadata accurate (2.1–2.3)
- [ ] Hardware compatibility verified (2.4)
- [ ] Only public APIs used; current OS required (2.5)
- [ ] Payment model clear; IAP properly implemented if applicable (3.1)
- [ ] Business model transparent (3.2)
- [ ] Original design; meets minimum functionality (4.1–4.2)
- [ ] Privacy policy included and clear (5.1.1)
- [ ] Intellectual property rights verified (5.2)
- [ ] Gaming/gambling (if applicable) properly licensed (5.3)
- [ ] Developer info complete and accurate (1.5)
- [ ] Contact information up-to-date

---

## 📌 Notes

This is a living document. New apps may trigger new rules. Keep guidelines updated as Apple releases changes.

**Document saved**: 2026-09-06  
**Next review date**: Before next App Store submission
