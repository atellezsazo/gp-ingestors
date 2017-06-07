'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const rp = require('request-promise');
const rss2json = require('rss-to-json');
const url = require('url');
const xml2js = require('xml2js');
const template = require('./template');

const BASE_URI = 'https://www.kapanlagi.com/';
const MAX_LINKS = 60;
const RSS_URI = 'https://www.kapanlagi.com/feed/';

// Remove elements (body)
const REMOVE_ELEMENTS = [
    'iframe',
    'noscript',
    'script',
    'style',
    '.box-share-img-detail',
    '.lifestyle-in-content',
    '.link-pagging-warper',
    '.paging-related',
    '.video-wrapper',
];

// clean attr (tag)
const REMOVE_ATTR = [
    'class',
    'height',
    'id',
    'sizes',
    'srcset',
    'style',
    'width'
];

// clean attr (tag)
const CLEAN_TAGS = [
    'a',
    'div',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'i',
    'img',
    'span',
    'table',
];


function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($profile) => {
        if ($profile('meta[http-equiv="REFRESH"]').length == 1) throw { name: 'Article have a redirect' };
        if ($profile('title').text().includes('404')) throw { name: 'Not Found 404' };

        const asset = new libingester.NewsArticle();
        const category = $profile(".newsdetail-categorylink").first().text();
        const date = $profile('.vcard .newsdetail-schedule-new.updated').text();
        const info_date = $profile('.newsdetail-schedule-new .value-title').attr('title');
        const modified_date = info_date ? new Date(Date.parse(info_date)) : new Date();
        const post_tags = $profile('.box-content a');
        const reporter = $profile('.vcard .newsdetail-schedule-new a').text();
        const subtitle = $profile("h2.entertainment-newsdetail-title-new").first().text();
        const synopsis = $profile('meta[name="description"]').attr('content');
        const title = $profile("#newsdetail-right-new h1").first().text();
        const uri_main_image = $profile('meta[property="og:image"]').attr('content');

        // article settings
        asset.set_canonical_uri(uri);
        asset.set_last_modified_date(modified_date);
        asset.set_section(category);
        asset.set_synopsis(synopsis);
        asset.set_title(title);

        // Pull out the main image
        let main_image, image_credit;
        if (uri_main_image) {
            main_image = libingester.util.download_image(uri_main_image, uri);
            main_image.set_title(title);
            image_credit = $profile('.entertainment-newsdetail-headlineimg .copyright, .pg-img-warper span').text();
            hatch.save_asset(main_image);
            asset.set_thumbnail(main_image);
        }

        let pages = [];
        const ingest_body = ($profile, finish_process) => {
            const post_body = $profile('.entertainment-detail-news');
            const next = $profile('.link-pagging-warper a').attr('href');
            const last_pagination = $profile('ul.pg-pagging li:last-child a').first();

            // resolve links
            post_body.find("a").map(function() {
                if (this.attribs.href)
                    this.attribs.href = url.resolve(BASE_URI, this.attribs.href);
            });

            // remove elements and comments
            const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $profile(tag).removeAttr(attr));
            post_body.contents().filter((index, node) => node.type === 'comment').remove();
            post_body.find(REMOVE_ELEMENTS.join(',')).remove();
            post_body.find(CLEAN_TAGS.join(',')).get().map((tag) => clean_attr(tag));

            // Download images
            post_body.find("img").map(function() {
                if (this.attribs.src) {
                    const image = libingester.util.download_img($profile(this));
                    image.set_title(title);
                    hatch.save_asset(image);
                } else {
                    $profile(this).remove();
                }
            });

            pages.push(post_body.html());

            if (next && last_pagination.length != 0) {
                libingester.util.fetch_html(url.resolve(uri, next)).then(($next_profile) => {
                    ingest_body($next_profile, finish_process);
                });
            } else {
                finish_process();
            }
        };

        return new Promise((resolve, reject) => {
            ingest_body($profile, () => {
                const content = mustache.render(template.structure_template, {
                    title: title,
                    subtitle: subtitle,
                    author: reporter,
                    category: category,
                    date_published: date,
                    main_image: main_image,
                    image_credit: image_credit,
                    body: pages.join(''),
                    post_tags: post_tags,
                });

                // save document
                asset.set_document(content);
                hatch.save_asset(asset);
                resolve();
            });
        })
    }).catch((err) => {
        console.log("Ingest error: ", err.name);
    });
}

function main() {
    const hatch = new libingester.Hatch();
    const __request = (f) => {
        rp({ uri: RSS_URI, gzip: true }).then((res) => {
            var parser = new xml2js.Parser({ trim: false, normalize: true, mergeAttrs: true });
            parser.parseString(res, (err, result) => {
                const rss = rss2json.parser(result);
                let links = [],
                    n = 0;
                rss.items.map((datum) => {
                    if (!datum.link.includes("musik.kapanlagi.com") && n++ < MAX_LINKS) { //drop musik subdomain
                        links.push(datum.link);
                    }
                });
                f(links); //callback
            });
        }).catch((err) => {
            console.log('ERR RP: ', err.name);
            __request(f);
        });
    }

    __request((links) => {
        Promise.all(links.map((link) => ingest_article(hatch, link))).then(() => {
            return hatch.finish();
        }).catch((err) => console.log('ALL: ', err.name));
    })
}

main();