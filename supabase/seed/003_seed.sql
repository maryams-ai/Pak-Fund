-- =====================================================================
-- Startup Funding Database (Pakistan)
-- seed/003_seed.sql : fictional sample data
--
-- Run in the Supabase SQL editor (role postgres, which bypasses RLS)
-- after 001_schema.sql and 002_rls.sql.
--
-- ALL NAMES AND NUMBERS ARE INVENTED. Every seed startup and investor
-- has a website ending in ".example" and every seed founder an email
-- ending in ".example" (a domain reserved for fake data). That marks
-- the rows as sample data and lets this script delete exactly its own
-- rows, so it is safe to run again.
--
-- Demo accounts (create by hand, see part 9): if they exist, the
-- script links them; if not, it skips that part. Run the script again
-- after creating them.
-- =====================================================================

begin;


-- ---------------------------------------------------------------------
-- 0. Clean old seed rows
-- Deleting a startup also deletes its rounds, investments, team links,
-- pitches, watchlist rows and acquisition (ON DELETE CASCADE).
-- Investment -> Investor is RESTRICT, so those investments go first.
-- Cities and industries are kept (part 1 skips existing ones).
-- ---------------------------------------------------------------------
delete from public.Startup
where website like 'https://%.example';

delete from public.Investment
where investorNo in (select investorNo from public.Investor
                     where website like 'https://%.example');

delete from public.Investor
where website like 'https://%.example';

delete from public.Founder
where email like '%.example';


-- ---------------------------------------------------------------------
-- 1. Lookup tables: 11 cities, 10 industries
-- ON CONFLICT DO NOTHING: the UNIQUE constraints from 001 make a
-- second run skip rows that already exist.
-- ---------------------------------------------------------------------
insert into public.City (cityName, province) values
    ('Lahore',     'Punjab'),
    ('Karachi',    'Sindh'),
    ('Islamabad',  'Islamabad Capital Territory'),
    ('Rawalpindi', 'Punjab'),
    ('Peshawar',   'Khyber Pakhtunkhwa'),
    ('Multan',     'Punjab'),
    ('Faisalabad', 'Punjab'),
    ('Sialkot',    'Punjab'),
    ('Hyderabad',  'Sindh'),
    ('Quetta',     'Balochistan'),
    ('Gilgit',     'Gilgit-Baltistan')
on conflict do nothing;

insert into public.Industry (industryName, description) values
    ('FinTech',    'Payments, lending, savings and other money services'),
    ('AgriTech',   'Tools and markets for farmers and the food supply chain'),
    ('HealthTech', 'Doctors, medicines and diagnostics made easier to reach'),
    ('EdTech',     'Online learning, tutoring and skills training'),
    ('E-commerce', 'Online marketplaces and selling platforms'),
    ('Logistics',  'Delivery, freight and fleet management'),
    ('CleanTech',  'Solar, energy saving and clean water'),
    ('SaaS',       'Business software sold as a subscription'),
    ('Mobility',   'Rides, commuting and electric vehicles'),
    ('PropTech',   'Renting, buying and managing property')
on conflict do nothing;


-- ---------------------------------------------------------------------
-- 2. Startups: 30 rows
-- 26 approved, 4 pending (Hisaab, Paani Pure, Hunar Ghar, Mazdoor
-- Connect) for the Admin review demo. Daftar OS is Acquired (see part
-- 6), Tanki Track is Closed. userNo is NULL for now; part 9 links the
-- demo founder to Rozgar Pay and Hisaab.
-- ---------------------------------------------------------------------
insert into public.Startup
    (cityNo, industryNo, startupName, tagline, description,
     foundedYear, website, stage, status, teamSize, isApproved)
select c.cityNo, i.industryNo, v.startupName, v.tagline, v.description,
       v.foundedYear, 'https://' || v.domain || '.example',
       v.stage, v.status, v.teamSize, v.isApproved
from (values
    ('Rozgar Pay', 'Lahore', 'FinTech', 'Instant wage payouts for daily-wage and gig workers.',
     'Employers pay workers the same day through a mobile wallet, with no bank account needed. Workers cash out at partner shops.',
     2022, 'rozgarpay', 'Seed', 'Active', 18, true),
    ('Kisan Link', 'Multan', 'AgriTech', 'Connects small farmers directly with wholesale buyers.',
     'Farmers list their harvest by voice note and get offers from verified buyers, cutting out extra middlemen.',
     2023, 'kisanlink', 'Pre-Seed', 'Active', 9, true),
    ('Saaf Energy', 'Lahore', 'CleanTech', 'Rooftop solar financing for small factories.',
     'Small factories install rooftop solar with no upfront cost and pay monthly from their electricity savings.',
     2022, 'saafenergy', 'Seed', 'Active', 14, true),
    ('Hisaab', 'Lahore', 'FinTech', 'Simple bookkeeping for small traders.',
     'A phone app that replaces the paper khata: track credit, send payment reminders and see daily sales.',
     2024, 'hisaab', 'Pre-Seed', 'Active', 5, false),
    ('Parhai Plus', 'Peshawar', 'EdTech', 'Affordable tutoring in Pashto, Urdu and English.',
     'Recorded lessons and weekly live sessions for school students, priced for families in smaller towns.',
     2023, 'parhaiplus', 'Pre-Seed', 'Active', 8, true),
    ('Sehat Dost', 'Karachi', 'HealthTech', 'Online doctor consults and lab tests at home.',
     'Video consults with licensed doctors, plus home sample collection for common lab tests.',
     2021, 'sehatdost', 'Series A', 'Active', 42, true),
    ('Dukaan Cloud', 'Karachi', 'E-commerce', 'Point-of-sale and credit for neighbourhood shops.',
     'A tablet till for kiryana stores that tracks stock and offers short-term stock credit.',
     2021, 'dukaancloud', 'Series A', 'Active', 35, true),
    ('Safar Go', 'Islamabad', 'Logistics', 'Intercity parcel delivery with live tracking.',
     'Next-day parcel delivery between major cities using spare space on intercity buses.',
     2022, 'safargo', 'Seed', 'Active', 20, true),
    ('Zakat Pay', 'Islamabad', 'FinTech', 'Verified giving with transparent receipts.',
     'Donors give to verified families and charities and get a receipt showing where the money went.',
     2022, 'zakatpay', 'Seed', 'Active', 11, true),
    ('Chashma Health', 'Islamabad', 'HealthTech', 'Low-cost eye tests and glasses in small towns.',
     'Mobile eye camps with a tablet-based test and glasses delivered within a week.',
     2023, 'chashmahealth', 'Seed', 'Active', 16, true),
    ('Mandi Mate', 'Faisalabad', 'AgriTech', 'Daily crop prices and trade tools for commission agents.',
     'Live mandi rates, digital receipts and payment tracking for arhtis and the farmers they serve.',
     2021, 'mandimate', 'Seed', 'Active', 22, true),
    ('Kapra Hub', 'Faisalabad', 'E-commerce', 'Wholesale fabric marketplace for small garment makers.',
     'Small stitching units buy fabric in small lots straight from mills, with delivery included.',
     2024, 'kaprahub', 'Pre-Seed', 'Active', 7, true),
    ('Bijli Bachat', 'Karachi', 'CleanTech', 'Smart meters that cut electricity bills for homes.',
     'A plug-in meter and app that show which appliances use the most power and when to switch them off.',
     2024, 'bijlibachat', 'Pre-Seed', 'Active', 4, true),
    ('Rasta Rides', 'Lahore', 'Mobility', 'Shared vans for safe daily office commutes.',
     'Fixed-route air-conditioned vans with booked seats, popular with women commuting to offices.',
     2020, 'rastarides', 'Series A', 'Active', 85, true),
    ('Ghar Dhoondo', 'Islamabad', 'PropTech', 'Verified rental and sale listings with virtual tours.',
     'Every listing is visited and photographed by the team, so renters see the real house before they go.',
     2022, 'ghardhoondo', 'Seed', 'Active', 19, true),
    ('Ustad Online', 'Lahore', 'EdTech', 'Live classes for matric and FSc students.',
     'Evening live classes with past-paper practice and monthly progress reports for parents.',
     2021, 'ustadonline', 'Seed', 'Active', 30, true),
    ('Dawai Express', 'Lahore', 'HealthTech', 'Medicine delivery from local pharmacies in an hour.',
     'Customers upload a prescription and a nearby partner pharmacy delivers within the hour.',
     2024, 'dawaiexpress', 'Pre-Seed', 'Active', 10, true),
    ('Cargo Chalo', 'Karachi', 'Logistics', 'Book trucks for intercity freight in minutes.',
     'Shippers post a load, get prices from verified truck owners and track the trip until delivery.',
     2020, 'cargochalo', 'Series A', 'Active', 60, true),
    ('Shift Saaz', 'Lahore', 'SaaS', 'Staff scheduling and attendance for restaurants and shops.',
     'Managers build weekly rosters, staff check in with their phone and payroll hours are counted automatically.',
     2023, 'shiftsaaz', 'Seed', 'Active', 12, true),
    ('Paani Pure', 'Quetta', 'CleanTech', 'Solar water filters for villages.',
     'Community water filters powered by solar panels, paid for through a small monthly fee per household.',
     2025, 'paanipure', 'Idea', 'Active', 3, false),
    ('Fasal Data', 'Hyderabad', 'AgriTech', 'Satellite crop health reports for farmers.',
     'Weekly SMS reports on crop health and water stress, built from free satellite images.',
     2023, 'fasaldata', 'Seed', 'Active', 13, true),
    ('Qist Easy', 'Karachi', 'FinTech', 'Buy now, pay later for electronics and appliances.',
     'Shoppers split the price of phones and appliances into monthly instalments at partner stores.',
     2019, 'qisteasy', 'Series B+', 'Active', 140, true),
    ('Gend Balla', 'Sialkot', 'E-commerce', 'Direct-to-buyer sports goods from Sialkot makers.',
     'Local workshops sell cricket and football gear online to buyers at home and abroad.',
     2023, 'gendballa', 'Seed', 'Active', 15, true),
    ('Pahar Trails', 'Gilgit', 'E-commerce', 'Book local guides and homestays in the north.',
     'Tourists book verified local guides and family homestays, and hosts are paid in advance.',
     2024, 'pahartrails', 'Pre-Seed', 'Active', 6, true),
    ('Kiraya Ghar', 'Karachi', 'PropTech', 'Rent collection and tenant checks for landlords.',
     'Landlords collect rent online, keep records and run basic tenant background checks.',
     2024, 'kirayaghar', 'Pre-Seed', 'Active', 6, true),
    ('Hunar Ghar', 'Rawalpindi', 'EdTech', 'Short vocational courses with job placement.',
     'Three-month courses in trades such as solar fitting and mobile repair, linked to hiring partners.',
     2025, 'hunarghar', 'Idea', 'Active', 2, false),
    ('Sabz Rickshaw', 'Lahore', 'Mobility', 'Electric rickshaws on lease for drivers.',
     'Drivers lease an electric rickshaw by the week and swap batteries at partner stations.',
     2023, 'sabzrickshaw', 'Seed', 'Active', 25, true),
    ('Daftar OS', 'Islamabad', 'SaaS', 'HR and payroll software for mid-size companies.',
     'Attendance, leave, payroll and tax slips in one system, built for local labour rules.',
     2020, 'daftaros', 'Series A', 'Acquired', 48, true),
    ('Mazdoor Connect', 'Multan', 'E-commerce', 'Hire verified electricians, plumbers and painters.',
     'Customers book checked tradespeople at fixed prices, and workers get paid through the app.',
     2025, 'mazdoorconnect', 'Pre-Seed', 'Active', 4, false),
    ('Tanki Track', 'Karachi', 'Logistics', 'Water tanker booking with live tracking.',
     'Households booked water tankers at a fixed price and tracked them to the door. Shut down in 2024.',
     2022, 'tankitrack', 'Seed', 'Closed', 12, true)
) as v (startupName, cityName, industryName, tagline, description,
        foundedYear, domain, stage, status, teamSize, isApproved)
join public.City     c on c.cityName     = v.cityName
join public.Industry i on i.industryName = v.industryName;


-- ---------------------------------------------------------------------
-- 3. Founders (people) and StartupFounder (who works where)
-- First the people, then the links. Ayesha Khan and Usman Tariq are
-- linked to both Rozgar Pay and Hisaab, showing that one person can
-- found several startups (the reason Founder is its own table).
-- Links are matched on the unique seed email.
-- ---------------------------------------------------------------------
insert into public.Founder (fullName, email) values
    ('Ayesha Khan',        'ayesha@rozgarpay.example'),
    ('Usman Tariq',        'usman@rozgarpay.example'),
    ('Ali Raza',           'ali@kisanlink.example'),
    ('Sadia Noor',         'sadia@kisanlink.example'),
    ('Fahad Malik',        'fahad@saafenergy.example'),
    ('Mehwish Iqbal',      'mehwish@saafenergy.example'),
    ('Gul Khan',           'gul@parhaiplus.example'),
    ('Sana Afridi',        'sana@parhaiplus.example'),
    ('Hira Siddiqui',      'hira@sehatdost.example'),
    ('Kamran Shah',        'kamran@sehatdost.example'),
    ('Fatima Zaidi',       'fatima@sehatdost.example'),
    ('Arsalan Sheikh',     'arsalan@dukaancloud.example'),
    ('Bushra Ali',         'bushra@dukaancloud.example'),
    ('Omer Farooq',        'omer@safargo.example'),
    ('Saad Abbasi',        'saad@safargo.example'),
    ('Maryam Javed',       'maryam@zakatpay.example'),
    ('Talha Hussain',      'talha@zakatpay.example'),
    ('Imran Butt',         'imran@chashmahealth.example'),
    ('Rabia Akhtar',       'rabia@chashmahealth.example'),
    ('Waqas Jutt',         'waqas@mandimate.example'),
    ('Noman Akram',        'noman@mandimate.example'),
    ('Hassan Mehmood',     'hassan@kaprahub.example'),
    ('Areeba Hasan',       'areeba@bijlibachat.example'),
    ('Junaid Memon',       'junaid@bijlibachat.example'),
    ('Faisal Rana',        'faisal@rastarides.example'),
    ('Amna Chaudhry',      'amna@rastarides.example'),
    ('Zeeshan Haider',     'zeeshan@rastarides.example'),
    ('Shoaib Khattak',     'shoaib@ghardhoondo.example'),
    ('Iqra Nadeem',        'iqra@ghardhoondo.example'),
    ('Nida Aslam',         'nida@ustadonline.example'),
    ('Bilal Anwar',        'bilal@ustadonline.example'),
    ('Hamid Ashraf',       'hamid@dawaiexpress.example'),
    ('Rida Fatima',        'rida@dawaiexpress.example'),
    ('Asad Baloch',        'asad@cargochalo.example'),
    ('Saima Qazi',         'saima@cargochalo.example'),
    ('Danish Riaz',        'danish@shiftsaaz.example'),
    ('Komal Sattar',       'komal@shiftsaaz.example'),
    ('Naveed Kakar',       'naveed@paanipure.example'),
    ('Ahsan Soomro',       'ahsan@fasaldata.example'),
    ('Hina Laghari',       'hina@fasaldata.example'),
    ('Rehan Ghani',        'rehan@qisteasy.example'),
    ('Sobia Karim',        'sobia@qisteasy.example'),
    ('Adeel Paracha',      'adeel@qisteasy.example'),
    ('Ahmed Cheema',       'ahmed@gendballa.example'),
    ('Usama Ghumman',      'usama@gendballa.example'),
    ('Karim Baig',         'karim@pahartrails.example'),
    ('Shireen Hunzai',     'shireen@pahartrails.example'),
    ('Mohsin Lakhani',     'mohsin@kirayaghar.example'),
    ('Sameer Abbasi',      'sameer@hunarghar.example'),
    ('Farah Naz',          'farah@sabzrickshaw.example'),
    ('Ali Hamza',          'alihamza@sabzrickshaw.example'),
    ('Kashif Mirza',       'kashif@daftaros.example'),
    ('Ammara Saleem',      'ammara@daftaros.example'),
    ('Rizwan Bhatti',      'rizwan@mazdoorconnect.example'),
    ('Yasir Qureshi',      'yasir@tankitrack.example'),
    ('Huma Shaikh',        'huma@tankitrack.example');

insert into public.StartupFounder (startupNo, founderNo, roleTitle, joinedYear)
select s.startupNo, f.founderNo, v.roleTitle, v.joinedYear
from (values
    ('Rozgar Pay',      'ayesha@rozgarpay.example',      'CEO and co-founder',      2022),
    ('Rozgar Pay',      'usman@rozgarpay.example',       'CTO and co-founder',      2022),
    ('Hisaab',          'ayesha@rozgarpay.example',      'CEO and co-founder',      2024),
    ('Hisaab',          'usman@rozgarpay.example',       'CTO and co-founder',      2024),
    ('Kisan Link',      'ali@kisanlink.example',         'CEO and co-founder',      2023),
    ('Kisan Link',      'sadia@kisanlink.example',       'COO and co-founder',      2023),
    ('Saaf Energy',     'fahad@saafenergy.example',      'CEO and co-founder',      2022),
    ('Saaf Energy',     'mehwish@saafenergy.example',    'CFO and co-founder',      2022),
    ('Parhai Plus',     'gul@parhaiplus.example',        'CEO and founder',         2023),
    ('Parhai Plus',     'sana@parhaiplus.example',       'Head of Content',         2023),
    ('Sehat Dost',      'hira@sehatdost.example',        'CEO and co-founder',      2021),
    ('Sehat Dost',      'kamran@sehatdost.example',      'CTO and co-founder',      2021),
    ('Sehat Dost',      'fatima@sehatdost.example',      'COO',                     2022),
    ('Dukaan Cloud',    'arsalan@dukaancloud.example',   'CEO and co-founder',      2021),
    ('Dukaan Cloud',    'bushra@dukaancloud.example',    'CTO and co-founder',      2021),
    ('Safar Go',        'omer@safargo.example',          'CEO and co-founder',      2022),
    ('Safar Go',        'saad@safargo.example',          'COO and co-founder',      2022),
    ('Zakat Pay',       'maryam@zakatpay.example',       'CEO and co-founder',      2022),
    ('Zakat Pay',       'talha@zakatpay.example',        'CTO and co-founder',      2022),
    ('Chashma Health',  'imran@chashmahealth.example',   'CEO and co-founder',      2023),
    ('Chashma Health',  'rabia@chashmahealth.example',   'Medical Director',        2023),
    ('Mandi Mate',      'waqas@mandimate.example',       'CEO and co-founder',      2021),
    ('Mandi Mate',      'noman@mandimate.example',       'CTO and co-founder',      2021),
    ('Kapra Hub',       'hassan@kaprahub.example',       'CEO and founder',         2024),
    ('Bijli Bachat',    'areeba@bijlibachat.example',    'CEO and co-founder',      2024),
    ('Bijli Bachat',    'junaid@bijlibachat.example',    'CTO and co-founder',      2024),
    ('Rasta Rides',     'faisal@rastarides.example',     'CEO and co-founder',      2020),
    ('Rasta Rides',     'amna@rastarides.example',       'COO and co-founder',      2020),
    ('Rasta Rides',     'zeeshan@rastarides.example',    'CTO',                     2021),
    ('Ghar Dhoondo',    'shoaib@ghardhoondo.example',    'CEO and co-founder',      2022),
    ('Ghar Dhoondo',    'iqra@ghardhoondo.example',      'Head of Product',         2022),
    ('Ustad Online',    'nida@ustadonline.example',      'CEO and co-founder',      2021),
    ('Ustad Online',    'bilal@ustadonline.example',     'CTO and co-founder',      2021),
    ('Dawai Express',   'hamid@dawaiexpress.example',    'CEO and co-founder',      2024),
    ('Dawai Express',   'rida@dawaiexpress.example',     'COO and co-founder',      2024),
    ('Cargo Chalo',     'asad@cargochalo.example',       'CEO and co-founder',      2020),
    ('Cargo Chalo',     'saima@cargochalo.example',      'CFO and co-founder',      2020),
    ('Shift Saaz',      'danish@shiftsaaz.example',      'CEO and co-founder',      2023),
    ('Shift Saaz',      'komal@shiftsaaz.example',       'CTO and co-founder',      2023),
    ('Paani Pure',      'naveed@paanipure.example',      'Founder',                 2025),
    ('Fasal Data',      'ahsan@fasaldata.example',       'CEO and co-founder',      2023),
    ('Fasal Data',      'hina@fasaldata.example',        'CTO and co-founder',      2023),
    ('Qist Easy',       'rehan@qisteasy.example',        'CEO and co-founder',      2019),
    ('Qist Easy',       'sobia@qisteasy.example',        'CFO and co-founder',      2019),
    ('Qist Easy',       'adeel@qisteasy.example',        'CTO',                     2020),
    ('Gend Balla',      'ahmed@gendballa.example',       'CEO and co-founder',      2023),
    ('Gend Balla',      'usama@gendballa.example',       'COO and co-founder',      2023),
    ('Pahar Trails',    'karim@pahartrails.example',     'CEO and co-founder',      2024),
    ('Pahar Trails',    'shireen@pahartrails.example',   'Co-founder, Operations',  2024),
    ('Kiraya Ghar',     'mohsin@kirayaghar.example',     'CEO and founder',         2024),
    ('Hunar Ghar',      'sameer@hunarghar.example',      'Founder',                 2025),
    ('Sabz Rickshaw',   'farah@sabzrickshaw.example',    'CEO and co-founder',      2023),
    ('Sabz Rickshaw',   'alihamza@sabzrickshaw.example', 'CTO and co-founder',      2023),
    ('Daftar OS',       'kashif@daftaros.example',       'CEO and co-founder',      2020),
    ('Daftar OS',       'ammara@daftaros.example',       'CTO and co-founder',      2020),
    ('Mazdoor Connect', 'rizwan@mazdoorconnect.example', 'Founder',                 2025),
    ('Tanki Track',     'yasir@tankitrack.example',      'CEO and co-founder',      2022),
    ('Tanki Track',     'huma@tankitrack.example',       'COO and co-founder',      2022)
) as v (startupName, email, roleTitle, joinedYear)
join public.Startup s on s.startupName = v.startupName and s.website like 'https://%.example'
join public.Founder f on f.email = v.email;


-- ---------------------------------------------------------------------
-- 4. Investors (15) and the industries they back
-- Types: 4 VC Firm, 5 Angel, 1 Accelerator (Karakoram Seed Fund, as in
-- the mockup), 5 Individual. 12 verified; 3 unverified (Thar Capital,
-- Bolan Angels, Zara Siddiqui) wait in the Admin panel and have no
-- investments. userNo is NULL; part 9 links the demo investor account
-- to Bilal Chaudhry.
-- ---------------------------------------------------------------------
insert into public.Investor
    (cityNo, investorName, investorType, bio, website, minTicketUsd, maxTicketUsd, isVerified)
select c.cityNo, v.investorName, v.investorType, v.bio,
       'https://' || v.domain || '.example', v.minTicket, v.maxTicket, v.isVerified
from (values
    ('Ravi Ventures',         'Lahore',     'VC Firm',     'Early-stage fund backing fintech and marketplace founders across Punjab.',
     'raviventures',        100000,  1000000, true),
    ('Indus Growth Partners', 'Karachi',    'VC Firm',     'Growth fund leading Series A and later rounds in fintech, logistics and software.',
     'indusgrowth',         500000,  5000000, true),
    ('Margalla Capital',      'Islamabad',  'VC Firm',     'Seed and Series A investor in SaaS, health and logistics.',
     'margallacapital',     300000,  3000000, true),
    ('Chenab Ventures',       'Faisalabad', 'VC Firm',     'Backs agriculture, textiles and clean energy businesses outside the big three cities.',
     'chenabventures',      150000,  1500000, true),
    ('Thar Capital',          'Karachi',    'VC Firm',     'New fund focused on energy and supply-chain startups in Sindh.',
     'tharcapital',         250000,  2000000, false),
    ('Peshawar Angels',       'Peshawar',   'Angel',       'Angel group from Khyber Pakhtunkhwa writing first cheques in education and health.',
     'peshawarangels',       20000,   150000, true),
    ('Sindh Angels Network',  'Karachi',    'Angel',       'Angel group writing first cheques for health, education and fintech founders.',
     'sindhangels',          25000,   200000, true),
    ('Lahore Founders Club',  'Lahore',     'Angel',       'Former founders investing their own money alongside mentorship.',
     'lahorefounders',       15000,   150000, true),
    ('Bolan Angels',          'Quetta',     'Angel',       'Small angel circle interested in water, farming and clean energy in Balochistan.',
     'bolanangels',          10000,    75000, false),
    ('Multan Growth Circle',  'Multan',     'Angel',       'Local business owners backing agriculture and trade startups in South Punjab.',
     'multangrowth',         10000,   100000, true),
    ('Karakoram Seed Fund',   'Islamabad',  'Accelerator', 'Four-month programme with a small seed investment per cohort.',
     'karakoramseed',        20000,   100000, true),
    ('Bilal Chaudhry',        'Karachi',    'Individual',  'Operator turned angel, focused on consumer and logistics.',
     'bilalchaudhry',        10000,    80000, true),
    ('Hamza Qureshi',         'Lahore',     'Individual',  'Software engineer investing small cheques in fintech and SaaS.',
     'hamzaqureshi',          5000,    50000, true),
    ('Nadia Rauf',            'Islamabad',  'Individual',  'Doctor and angel investor interested in health, property and mobility.',
     'nadiarauf',            10000,   100000, true),
    ('Zara Siddiqui',         'Karachi',    'Individual',  'Teacher turned investor looking at education and online retail.',
     'zarasiddiqui',          5000,    40000, false)
) as v (investorName, cityName, investorType, bio, domain, minTicket, maxTicket, isVerified)
join public.City c on c.cityName = v.cityName;

insert into public.InvestorIndustry (investorNo, industryNo)
select inv.investorNo, ind.industryNo
from (values
    ('Ravi Ventures', 'FinTech'), ('Ravi Ventures', 'E-commerce'),
    ('Ravi Ventures', 'Logistics'), ('Ravi Ventures', 'Mobility'),
    ('Indus Growth Partners', 'FinTech'), ('Indus Growth Partners', 'Logistics'),
    ('Indus Growth Partners', 'Mobility'), ('Indus Growth Partners', 'SaaS'),
    ('Margalla Capital', 'SaaS'), ('Margalla Capital', 'Logistics'),
    ('Margalla Capital', 'HealthTech'), ('Margalla Capital', 'FinTech'),
    ('Chenab Ventures', 'AgriTech'), ('Chenab Ventures', 'CleanTech'),
    ('Chenab Ventures', 'E-commerce'),
    ('Thar Capital', 'CleanTech'), ('Thar Capital', 'Logistics'),
    ('Peshawar Angels', 'EdTech'), ('Peshawar Angels', 'HealthTech'),
    ('Sindh Angels Network', 'HealthTech'), ('Sindh Angels Network', 'EdTech'),
    ('Sindh Angels Network', 'FinTech'),
    ('Lahore Founders Club', 'SaaS'), ('Lahore Founders Club', 'FinTech'),
    ('Lahore Founders Club', 'EdTech'),
    ('Bolan Angels', 'AgriTech'), ('Bolan Angels', 'CleanTech'),
    ('Multan Growth Circle', 'AgriTech'), ('Multan Growth Circle', 'E-commerce'),
    ('Karakoram Seed Fund', 'AgriTech'), ('Karakoram Seed Fund', 'CleanTech'),
    ('Karakoram Seed Fund', 'FinTech'),
    ('Bilal Chaudhry', 'Logistics'), ('Bilal Chaudhry', 'E-commerce'),
    ('Hamza Qureshi', 'FinTech'), ('Hamza Qureshi', 'SaaS'),
    ('Nadia Rauf', 'HealthTech'), ('Nadia Rauf', 'PropTech'), ('Nadia Rauf', 'Mobility'),
    ('Zara Siddiqui', 'EdTech'), ('Zara Siddiqui', 'E-commerce')
) as v (investorName, industryName)
join public.Investor inv on inv.investorName = v.investorName and inv.website like 'https://%.example'
join public.Industry ind on ind.industryName = v.industryName;


-- ---------------------------------------------------------------------
-- 5. Funding rounds (42) and investments (74)
-- Rounds: 1 to 3 per startup; Idea-stage and some new startups have
-- none. valuationUsd is NULL where it was not disclosed. Round types
-- include Angel, Grant and Debt.
-- Investments: each row says which investor put how much into which
-- round. A round is found by (startup, roundType), which is unique in
-- this seed. No investor appears twice in the same round, so
-- UNIQUE(roundNo, investorNo) holds. Investor amounts never add up to
-- more than the round. One amount is NULL (undisclosed): Nadia Rauf
-- in the Rasta Rides Series A.
-- ---------------------------------------------------------------------
insert into public.FundingRound (startupNo, roundType, roundDate, amountRaisedUsd, valuationUsd)
select s.startupNo, v.roundType, v.roundDate::date, v.amount, v.valuation
from (values
    ('Rozgar Pay',     'Angel',          '2023-01-15',   100000, null),
    ('Rozgar Pay',     'Pre-Seed',       '2023-06-20',   400000,  2500000),
    ('Rozgar Pay',     'Seed',           '2024-03-10',   900000,  6000000),
    ('Kisan Link',     'Pre-Seed',       '2024-01-18',   450000,  3000000),
    ('Saaf Energy',    'Pre-Seed',       '2023-02-11',   300000,  2000000),
    ('Saaf Energy',    'Seed',           '2024-05-22',   800000,  5500000),
    ('Hisaab',         'Pre-Seed',       '2024-07-01',   220000,  1500000),
    ('Parhai Plus',    'Pre-Seed',       '2024-02-14',   180000,  1200000),
    ('Sehat Dost',     'Seed',           '2022-05-10',   600000,  4000000),
    ('Sehat Dost',     'Series A',       '2024-02-20',  2800000, 18000000),
    ('Dukaan Cloud',   'Seed',           '2022-03-08',   500000,  3500000),
    ('Dukaan Cloud',   'Series A',       '2023-11-15',  2500000, 14000000),
    ('Safar Go',       'Seed',           '2023-08-09',   800000,  5000000),
    ('Zakat Pay',      'Pre-Seed',       '2023-03-01',   150000,  1000000),
    ('Zakat Pay',      'Seed',           '2024-09-12',   450000,  3600000),
    ('Chashma Health', 'Seed',           '2024-11-05',   550000,  4000000),
    ('Mandi Mate',     'Pre-Seed',       '2022-09-15',   200000, null),
    ('Mandi Mate',     'Seed',           '2024-04-28',   700000,  4800000),
    ('Kapra Hub',      'Pre-Seed',       '2025-01-20',   250000,  1800000),
    ('Bijli Bachat',   'Angel',          '2024-06-03',    60000, null),
    ('Rasta Rides',    'Seed',           '2021-10-12',  1200000,  7000000),
    ('Rasta Rides',    'Series A',       '2023-05-30',  6500000, 32000000),
    ('Ghar Dhoondo',   'Seed',           '2023-12-04',   650000,  4200000),
    ('Ustad Online',   'Pre-Seed',       '2022-01-25',   180000, null),
    ('Ustad Online',   'Seed',           '2023-07-17',   600000,  3900000),
    ('Dawai Express',  'Pre-Seed',       '2025-03-11',   200000,  1400000),
    ('Cargo Chalo',    'Seed',           '2021-06-01',   900000,  5000000),
    ('Cargo Chalo',    'Series A',       '2022-09-19',  4000000, 20000000),
    ('Shift Saaz',     'Seed',           '2024-08-26',   500000,  3500000),
    ('Fasal Data',     'Seed',           '2024-10-08',   400000,  2800000),
    ('Qist Easy',      'Seed',           '2020-02-10',  1000000,  6000000),
    ('Qist Easy',      'Series A',       '2021-08-23',  5000000, 25000000),
    ('Qist Easy',      'Series B',       '2023-04-12', 12000000, 70000000),
    ('Gend Balla',     'Seed',           '2024-12-02',   350000,  2500000),
    ('Pahar Trails',   'Grant',          '2024-05-15',    50000, null),
    ('Kiraya Ghar',    'Pre-Seed',       '2025-02-27',   150000,  1100000),
    ('Sabz Rickshaw',  'Pre-Seed',       '2023-09-14',   250000, null),
    ('Sabz Rickshaw',  'Seed',           '2025-04-09',  1000000,  7500000),
    ('Sabz Rickshaw',  'Debt',           '2025-07-01',   500000, null),
    ('Daftar OS',      'Seed',           '2021-04-19',   700000,  4500000),
    ('Daftar OS',      'Series A',       '2023-02-28',  3000000, 15000000),
    ('Tanki Track',    'Seed',           '2022-11-11',   300000,  2000000)
) as v (startupName, roundType, roundDate, amount, valuation)
join public.Startup s on s.startupName = v.startupName and s.website like 'https://%.example';

insert into public.Investment (roundNo, investorNo, amountUsd, isLead)
select r.roundNo, inv.investorNo, v.amount, v.isLead
from (values
    ('Rozgar Pay',     'Angel',    'Lahore Founders Club',    60000, true),
    ('Rozgar Pay',     'Angel',    'Hamza Qureshi',           40000, false),
    ('Rozgar Pay',     'Pre-Seed', 'Margalla Capital',       300000, true),
    ('Rozgar Pay',     'Pre-Seed', 'Sindh Angels Network',   100000, false),
    ('Rozgar Pay',     'Seed',     'Ravi Ventures',          600000, true),
    ('Rozgar Pay',     'Seed',     'Sindh Angels Network',   150000, false),
    ('Rozgar Pay',     'Seed',     'Bilal Chaudhry',          50000, false),
    ('Kisan Link',     'Pre-Seed', 'Chenab Ventures',        200000, true),
    ('Kisan Link',     'Pre-Seed', 'Karakoram Seed Fund',    100000, false),
    ('Kisan Link',     'Pre-Seed', 'Multan Growth Circle',    80000, false),
    ('Saaf Energy',    'Pre-Seed', 'Lahore Founders Club',   100000, true),
    ('Saaf Energy',    'Pre-Seed', 'Nadia Rauf',              50000, false),
    ('Saaf Energy',    'Seed',     'Chenab Ventures',        500000, true),
    ('Saaf Energy',    'Seed',     'Ravi Ventures',          250000, false),
    ('Parhai Plus',    'Pre-Seed', 'Peshawar Angels',        120000, true),
    ('Parhai Plus',    'Pre-Seed', 'Karakoram Seed Fund',     50000, false),
    ('Sehat Dost',     'Seed',     'Margalla Capital',       400000, true),
    ('Sehat Dost',     'Seed',     'Sindh Angels Network',   150000, false),
    ('Sehat Dost',     'Series A', 'Indus Growth Partners', 2000000, true),
    ('Sehat Dost',     'Series A', 'Margalla Capital',       600000, false),
    ('Dukaan Cloud',   'Seed',     'Ravi Ventures',          400000, true),
    ('Dukaan Cloud',   'Seed',     'Bilal Chaudhry',          50000, false),
    ('Dukaan Cloud',   'Series A', 'Indus Growth Partners', 1500000, true),
    ('Dukaan Cloud',   'Series A', 'Ravi Ventures',         1000000, false),
    ('Safar Go',       'Seed',     'Margalla Capital',       500000, true),
    ('Safar Go',       'Seed',     'Ravi Ventures',          250000, false),
    ('Zakat Pay',      'Pre-Seed', 'Karakoram Seed Fund',     80000, true),
    ('Zakat Pay',      'Pre-Seed', 'Nadia Rauf',              50000, false),
    ('Zakat Pay',      'Seed',     'Margalla Capital',       350000, true),
    ('Chashma Health', 'Seed',     'Margalla Capital',       300000, true),
    ('Chashma Health', 'Seed',     'Peshawar Angels',        100000, false),
    ('Chashma Health', 'Seed',     'Nadia Rauf',              40000, false),
    ('Mandi Mate',     'Pre-Seed', 'Multan Growth Circle',   100000, true),
    ('Mandi Mate',     'Pre-Seed', 'Hamza Qureshi',           30000, false),
    ('Mandi Mate',     'Seed',     'Chenab Ventures',        500000, true),
    ('Mandi Mate',     'Seed',     'Karakoram Seed Fund',    100000, false),
    ('Kapra Hub',      'Pre-Seed', 'Chenab Ventures',        200000, true),
    ('Bijli Bachat',   'Angel',    'Sindh Angels Network',    60000, true),
    ('Rasta Rides',    'Seed',     'Ravi Ventures',          800000, true),
    ('Rasta Rides',    'Seed',     'Lahore Founders Club',   150000, false),
    ('Rasta Rides',    'Series A', 'Indus Growth Partners', 4000000, true),
    ('Rasta Rides',    'Series A', 'Ravi Ventures',         1000000, false),
    ('Rasta Rides',    'Series A', 'Nadia Rauf',                null, false),
    ('Ghar Dhoondo',   'Seed',     'Margalla Capital',       450000, true),
    ('Ghar Dhoondo',   'Seed',     'Nadia Rauf',              60000, false),
    ('Ustad Online',   'Pre-Seed', 'Lahore Founders Club',   120000, true),
    ('Ustad Online',   'Seed',     'Ravi Ventures',          400000, true),
    ('Ustad Online',   'Seed',     'Peshawar Angels',        100000, false),
    ('Dawai Express',  'Pre-Seed', 'Lahore Founders Club',   100000, true),
    ('Dawai Express',  'Pre-Seed', 'Hamza Qureshi',           50000, false),
    ('Cargo Chalo',    'Seed',     'Indus Growth Partners',  600000, true),
    ('Cargo Chalo',    'Seed',     'Bilal Chaudhry',          80000, false),
    ('Cargo Chalo',    'Series A', 'Indus Growth Partners', 3000000, true),
    ('Shift Saaz',     'Seed',     'Ravi Ventures',          350000, true),
    ('Shift Saaz',     'Seed',     'Hamza Qureshi',           50000, false),
    ('Fasal Data',     'Seed',     'Chenab Ventures',        300000, true),
    ('Fasal Data',     'Seed',     'Multan Growth Circle',    60000, false),
    ('Qist Easy',      'Seed',     'Indus Growth Partners',  700000, true),
    ('Qist Easy',      'Series A', 'Indus Growth Partners', 3500000, true),
    ('Qist Easy',      'Series A', 'Margalla Capital',      1000000, false),
    ('Qist Easy',      'Series B', 'Indus Growth Partners', 5000000, true),
    ('Qist Easy',      'Series B', 'Margalla Capital',      2000000, false),
    ('Gend Balla',     'Seed',     'Chenab Ventures',        250000, true),
    ('Gend Balla',     'Seed',     'Sindh Angels Network',    50000, false),
    ('Kiraya Ghar',    'Pre-Seed', 'Nadia Rauf',              60000, true),
    ('Sabz Rickshaw',  'Pre-Seed', 'Lahore Founders Club',   100000, true),
    ('Sabz Rickshaw',  'Pre-Seed', 'Hamza Qureshi',           40000, false),
    ('Sabz Rickshaw',  'Seed',     'Ravi Ventures',          700000, true),
    ('Sabz Rickshaw',  'Seed',     'Chenab Ventures',        250000, false),
    ('Daftar OS',      'Seed',     'Margalla Capital',       500000, true),
    ('Daftar OS',      'Series A', 'Indus Growth Partners', 2000000, true),
    ('Daftar OS',      'Series A', 'Margalla Capital',       800000, false),
    ('Tanki Track',    'Seed',     'Sindh Angels Network',   100000, true),
    ('Tanki Track',    'Seed',     'Bilal Chaudhry',          50000, false)
) as v (startupName, roundType, investorName, amount, isLead)
join public.Startup      s   on s.startupName = v.startupName and s.website like 'https://%.example'
join public.FundingRound r   on r.startupNo = s.startupNo and r.roundType = v.roundType
join public.Investor     inv on inv.investorName = v.investorName and inv.website like 'https://%.example';


-- ---------------------------------------------------------------------
-- 6. Acquisition
-- Daftar OS (status already 'Acquired' in part 2) was bought by a
-- fictional company. UNIQUE(startupNo) allows only one such row.
-- ---------------------------------------------------------------------
insert into public.Acquisition (startupNo, acquirerName, acquisitionDate, priceUsd)
select startupNo, 'Kohsar Digital Holdings', date '2025-06-12', 18000000
from public.Startup
where startupName = 'Daftar OS' and website like 'https://%.example';


-- ---------------------------------------------------------------------
-- 7 to 9. Demo accounts, watchlist and pitches
--
-- profiles.userNo must exist in auth.users, so this script cannot
-- invent users. Watchlist and PitchRequest need a user, so they are
-- only added when these two accounts exist (create them first, see
-- the steps after this file):
--
--   founder.demo@example.com   -> becomes "Ayesha Khan", Founder,
--                                 owner of Rozgar Pay and Hisaab
--   investor.demo@example.com  -> becomes "Bilal Chaudhry", Investor,
--                                 manages the Bilal Chaudhry profile
--
-- Accounts made in the dashboard get role Founder by default (no
-- sign-up metadata), so the role is set here. This runs as postgres,
-- which the guard triggers from 002 allow.
--
-- Pitches follow the rules from 002: sent by the startup's owner, from
-- an approved startup (Rozgar Pay), to verified investors.
-- ---------------------------------------------------------------------
do $$
declare
    v_founder  uuid;
    v_investor uuid;
begin
    select userNo into v_founder  from public.profiles where email = 'founder.demo@example.com';
    select userNo into v_investor from public.profiles where email = 'investor.demo@example.com';

    -- Demo founder: profile, owned startups, watchlist, pitches
    if v_founder is not null then
        update public.profiles
        set fullName = 'Ayesha Khan', role = 'Founder', isActive = true
        where userNo = v_founder;

        update public.Startup set userNo = v_founder
        where startupName in ('Rozgar Pay', 'Hisaab') and website like 'https://%.example';

        insert into public.Watchlist (userNo, startupNo, savedAt)
        select v_founder, startupNo, now() - interval '5 days'
        from public.Startup
        where startupName in ('Sehat Dost', 'Dukaan Cloud') and website like 'https://%.example'
        on conflict do nothing;

        insert into public.PitchRequest (userNo, investorNo, startupNo, message, status, requestDate)
        select v_founder, i.investorNo, s.startupNo, v.message, v.status, v.requestDate::timestamptz
        from (values
            ('Bilal Chaudhry', 'Pending',
             'Salam Bilal, Rozgar Pay pays daily-wage workers the same day through a wallet. We have 40 employers and 6,000 workers on the app and are raising a 1.5M Seed extension. Could we show you a 10 minute demo?',
             '2025-10-08 11:30+05'),
            ('Ravi Ventures', 'Accepted',
             'Hi Ravi Ventures team, Rozgar Pay is growing 20 percent a month in Lahore and Faisalabad. We would like to talk about our next round and expansion to Karachi.',
             '2025-09-30 15:00+05'),
            ('Sindh Angels Network', 'Declined',
             'Assalam o Alaikum, we are Rozgar Pay, instant wage payouts for gig workers. We are looking for angels in Karachi to support our launch there.',
             '2025-09-20 10:15+05')
        ) as v (investorName, status, message, requestDate)
        join public.Investor i on i.investorName = v.investorName
                              and i.website like 'https://%.example' and i.isVerified
        join public.Startup  s on s.startupName = 'Rozgar Pay'
                              and s.website like 'https://%.example' and s.isApproved;

        raise notice 'Demo founder linked: Rozgar Pay, Hisaab, 2 watchlist rows, 3 pitches.';
    else
        raise notice 'founder.demo@example.com not found: skipped founder links, watchlist and pitches.';
    end if;

    -- Demo investor: profile, investor link, watchlist
    if v_investor is not null then
        update public.profiles
        set fullName = 'Bilal Chaudhry', role = 'Investor', isActive = true
        where userNo = v_investor;

        -- Investor.userNo is UNIQUE: skip if this account already has
        -- its own investor profile (e.g. made in the app).
        if not exists (select 1 from public.Investor where userNo = v_investor) then
            update public.Investor set userNo = v_investor
            where investorName = 'Bilal Chaudhry' and website like 'https://%.example';
        end if;

        insert into public.Watchlist (userNo, startupNo, savedAt)
        select v_investor, s.startupNo, now() - v.age
        from (values
            ('Rozgar Pay',  interval '2 days'),
            ('Kisan Link',  interval '7 days'),
            ('Saaf Energy', interval '21 days')
        ) as v (startupName, age)
        join public.Startup s on s.startupName = v.startupName and s.website like 'https://%.example'
        on conflict do nothing;

        raise notice 'Demo investor linked: Bilal Chaudhry, 3 watchlist rows.';
    else
        raise notice 'investor.demo@example.com not found: skipped investor link and watchlist.';
    end if;
end $$;

commit;


-- =====================================================================
-- 10. Checks
-- The SQL editor shows only the LAST result. To see the counts, select
-- that query on its own and press Run.
--
-- Expected after a fresh run: City 11, Industry 10, Startup 30
-- (approved 26), Founder 56, StartupFounder 58, Investor 15 (verified
-- 12), InvestorIndustry 41, FundingRound 42, Investment 74,
-- Acquisition 1. With both demo accounts: Watchlist 5, PitchRequest 3.
-- (City/Industry are higher if you added your own.)
-- =====================================================================
select 'City' as tableName, count(*) from public.City
union all select 'Industry',          count(*) from public.Industry
union all select 'Startup',           count(*) from public.Startup
union all select 'Startup approved',  count(*) from public.Startup where isApproved
union all select 'Founder',           count(*) from public.Founder
union all select 'StartupFounder',    count(*) from public.StartupFounder
union all select 'Investor',          count(*) from public.Investor
union all select 'Investor verified', count(*) from public.Investor where isVerified
union all select 'InvestorIndustry',  count(*) from public.InvestorIndustry
union all select 'FundingRound',      count(*) from public.FundingRound
union all select 'Investment',        count(*) from public.Investment
union all select 'Acquisition',       count(*) from public.Acquisition
union all select 'Watchlist',         count(*) from public.Watchlist
union all select 'PitchRequest',      count(*) from public.PitchRequest;

-- Total funding per startup, computed from FundingRound (never stored).
-- This is the same query that v_startup_total_funding will hold in
-- step 4. After step 4 you can run instead:
--   select * from v_startup_total_funding order by totalFundingUsd desc limit 10;
select s.startupNo,
       s.startupName,
       c.cityName,
       i.industryName,
       s.stage,
       count(r.roundNo)                       as roundCount,
       coalesce(sum(r.amountRaisedUsd), 0)    as totalFundingUsd
from public.Startup s
join public.City     c on c.cityNo     = s.cityNo
join public.Industry i on i.industryNo = s.industryNo
left join public.FundingRound r on r.startupNo = s.startupNo
where s.isApproved
group by s.startupNo, s.startupName, c.cityName, i.industryName, s.stage
order by totalFundingUsd desc
limit 10;
