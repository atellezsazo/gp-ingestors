'use strict';

const cheerio = require('cheerio');
const libingester = require('libingester');
const mustache = require('mustache');
const request = require('request');
const rp = require('request-promise');
const rss2json = require('rss-to-json');
const url = require('url');
const xml2js = require('xml2js');
const template = require('./template');

const RSS_URI = "https://www.kapanlagi.com/feed/";

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
    'src',
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
        const asset = new libingester.NewsArticle();
        const base_uri = libingester.util.get_doc_base_uri($profile, uri);
        asset.set_canonical_uri(uri);

        //Set title section
        const title = $profile("#newsdetail-right-new h1").first().text();
        const category = $profile(".newsdetail-categorylink").first().text();
        const subtitle = $profile("h2.entertainment-newsdetail-title-new").first().text();
        asset.set_title(title);

        const reporter = $profile('.vcard .newsdetail-schedule-new a').text();
        const date = $profile('.vcard .newsdetail-schedule-new.updated').text();

        // Pull out the main image
        const main_img = $profile('meta[property="og:image"]').attr('content');
        if (typeof main_img !== undefined) {
            const main_image = libingester.util.download_image(main_img, uri);
            main_image.set_title(title);
            const image_credit = $profile('.entertainment-newsdetail-headlineimg .copyright, .pg-img-warper span').text();
            hatch.save_asset(main_image);
            asset.set_thumbnail(main_image);
        }

        const synopsis = $profile('meta[name="description"]').attr('content');
        asset.set_synopsis(synopsis);
        const post_tags = $profile('.box-content a');

        // Pull out the updated date
        const info_date = $profile('.newsdetail-schedule-new .value-title').attr('title');
        let modified_date = new Date(Date.parse(info_date));
        if (!info_date) {
            modified_date = new Date();
        }

        asset.set_last_modified_date(modified_date);
        asset.set_section(category);

        let pages = [];
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $profile(tag).removeAttr(attr));
        const ingest_body = ($profile, finish_process) => {
            let post_body = $profile('.entertainment-detail-news');
            // Download images
            post_body.find("img").map(function() {
                if (this.attribs.src) {
                    const image = libingester.util.download_img($profile(this), base_uri);
                    image.set_title(title);
                    hatch.save_asset(image);
                    this.attribs["data-libingester-asset-id"] = image.asset_id;
                }
            });

            post_body.find(CLEAN_TAGS.join(',')).get().map((tag) => clean_attr(tag));

            // resolve links
            post_body.find("a").map(function() {
                if (typeof this.attribs.href !== undefined)
                    this.attribs.href = url.resolve(base_uri, this.attribs.href);
            });

            const next = $profile('.link-pagging-warper a').attr('href');
            const last_pagination = $profile('ul.pg-pagging li:last-child a').first();

            // remove elements and comments
            post_body.contents().filter((index, node) => node.type === 'comment').remove();
            post_body.find(REMOVE_ELEMENTS.join(',')).remove();
            pages.push(post_body.html());

            if (next && last_pagination.length != 0) {
                libingester.util.fetch_html(url.resolve(base_uri, next)).then(($next_profile) => {
                    ingest_body($next_profile, finish_process);
                });
            } else {
                finish_process();
            }
        };

        const promise = new Promise((resolve, reject) => {
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
        return Promise.all([promise]);
    }).catch((error) => {
        console.log("Ingest error: ", error);
    });
}

function main() {
    const hatch = new libingester.Hatch();
    rp({ uri: RSS_URI, gzip: true }).then((res) => {
        var parser = new xml2js.Parser({ trim: false, normalize: true, mergeAttrs: true });
        parser.parseString(res, (err, result) => {
            const rss = rss2json.parser(result);
            let links = [];
            rss.items.map((datum) => {
                if (!datum.link.includes("musik.kapanlagi.com")) { //drop musik subdomain
                    links.push(datum.link);
                }
            });

            Promise.all(links.map((link) => ingest_article(hatch, link))).then(() => {
                return hatch.finish();
            }).catch((err) => console.log(err));
        });
    });
}

main();