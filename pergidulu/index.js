'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const rss2json = require('rss-to-json');
const template = require('./template');

const RSS_FEED = 'https://www.pergidulu.com/feed/'; //Artists

//Remove attributes (images)
const REMOVE_ATTR = [
    'class',
    'data-lazy-sizes',
    'data-lazy-src',
    'data-lazy-srcset',
    'height',
    'sizes',
    'src',
    'srcset',
    'width',
];

//Remove elements (body)
const REMOVE_ELEMENTS = [
    'div',
    'noscript',
    'script',
    '.post-featured-img',
];

//Remove parents from these elements (body)
const REMOVE_ELEMENTS_PARENT = [
    'a.nectar-button',
    'span.guide-info-box',
];

function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($profile) => {
        const base_uri = libingester.util.get_doc_base_uri($profile, uri);
        const asset = new libingester.NewsArticle();

        // set title section
        const title = $profile('meta[property="og:title"]').attr('content');
        asset.set_title(title);
        asset.set_canonical_uri(uri);
        const description = $profile('meta[property="og:description"]').attr('content');
        asset.set_synopsis(description);

        // pull out the updated date and section
        const modified_date = $profile('meta[property="article:published_time"]').attr('content');
        asset.set_last_modified_date(new Date(Date.parse(modified_date)));
        const section = $profile('meta[property="article:section"]').attr('content');
        asset.set_section(section);

        // data for the template
        const info_article = $profile('div#single-below-header').first();
        const author = $profile(info_article).find('span.fn').text();
        const date = $profile(info_article).find('span.date').text();
        const category = $profile(info_article).find('span.meta-category').text();
        const body = $profile('div.post-content div.content-inner').first();

        // Pull out the main image
        let main_img = $profile('.post-featured-img img').first();
        if (typeof main_img.attr('data-lazy-src') !== undefined) {
            main_img.attr('src', main_img.attr('data-lazy-src'));
        }
        const main_image = libingester.util.download_img(main_img, base_uri);
        main_image.set_title(title);
        hatch.save_asset(main_image);
        asset.set_thumbnail(main_image);


        // remove elements and comments
        body.contents().filter((index, node) => node.type === 'comment').remove();
        body.find(REMOVE_ELEMENTS.join(',')).remove();

        for (const elem of REMOVE_ELEMENTS_PARENT) {
            body.find(elem).first().parent().remove();
        }

        // download images
        body.find("img").map(function() {
            if (typeof this.attribs['data-lazy-src'] !== undefined) {
                this.attribs.src = this.attribs['data-lazy-src'];
            }
            const image = libingester.util.download_img($profile(this), base_uri);
            image.set_title(title);
            hatch.save_asset(image);
            this.attribs["data-libingester-asset-id"] = image.asset_id;
        });

        //clean tags
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $profile(tag).removeAttr(attr));
        body.find("img").get().map((tag) => clean_attr(tag));

        // render template
        const content = mustache.render(template.structure_template, {
            title: title,
            author: author,
            date: date,
            category: category,
            main_image: main_image,
            body: body.children(),
        });

        asset.set_document(content);
        hatch.save_asset(asset);
    })
}

function main() {
    const hatch = new libingester.Hatch();
    rss2json.load(RSS_FEED, (err, rss) => {
        const news_uris = rss.items.map((datum) => datum.url);
        Promise.all(news_uris.map((uri) => ingest_article(hatch, uri))).then(() => {
            return hatch.finish();
        });
    });
}

main();