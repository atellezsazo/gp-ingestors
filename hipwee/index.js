'use strict';

const libingester = require('libingester');
const rss2json = require('rss-to-json');

const FEED_RSS = 'http://www.hipwee.com/feed/'; // recent articles

// elements to remove
const REMOVE_ELEMENTS = [
    'banner',
    'iframe',
    'noscript',
    'script',
    'video',
    '.fb-like-box',
    '.helpful-article',
    '.single-share',
    '.wp-video',
];

// attributes to remove
const REMOVE_ATTR = [
    'class',
    'data-alt',
    'data-src',
    'data-wpex-post-id',
    'height',
    'id',
    'sizes',
    'srcset',
    'width',
];

function ingest_article(hatch, item) {
    return libingester.util.fetch_html(item.url).then($ => {
        const asset = new libingester.NewsArticle();
        const author = $('meta[name="author"]').attr('content');
        const body = $('.post-content').first();
        const canonical_uri = $('link[rel="canonical"]').attr('href');
        const copyright = $('.copyright').first().text();
        const description = $('meta[name="description"]').attr('content');
        const first_p = body.find('p').first();
        const modified_date = new Date(item.created);
        const page = 'hipwee';
        const read_more = `Baca lebih lanjut tentang <a href="${canonical_uri}">${page}</a>`;
        const section = $('meta[property="article:section"]').attr('content');
        const title = $('meta[name="title"]').attr('content');
        const main_img = $('.post-image').first();

        // article settings
        console.log('processing', title);
        asset.set_authors([author]);
        asset.set_body(body);
        asset.set_canonical_uri(canonical_uri);
        asset.set_date_published(item.created);
        asset.set_last_modified_date(modified_date);
        asset.set_license(copyright);
        asset.set_read_more_link(read_more);
        asset.set_section(section);
        asset.set_source(page);
        asset.set_synopsis(description);
        asset.set_title(title);

        // pull out the main image
        const uri_main_image = main_img.find('img').first().attr('data-src');
        const image_credit = main_img.find('.image-credit').first().children();
        const main_image = libingester.util.download_image(uri_main_image);
        main_image.set_title(title);
        hatch.save_asset(main_image);
        asset.set_thumbnail(main_image);
        asset.set_main_image(main_image, image_credit);

        // set first paragraph of the body
        const lede = first_p.clone();
        lede.find('img').remove();
        asset.set_lede(lede);

        // remove and clean elements
        const clean_attr = (tag) => REMOVE_ATTR.forEach(attr => $(tag).removeAttr(attr));
        body.find(REMOVE_ELEMENTS.join(',')).remove();
        body.find(first_p).remove();
        body.find('div').map((i,elem) => clean_attr(elem));

        //Download images
        body.find('img').map(function() {
            const src = this.attribs.src || this.attribs['data-src'] || '';
            if (src.includes('http')) {
                this.attribs['src'] = src;
                this.attribs['alt'] = this.attribs['data-alt'];
                clean_attr(this);
                const image = libingester.util.download_img($(this));
                image.set_title(title);
                hatch.save_asset(image);
            } else {
                $(this).remove();
            }
        });

        asset.render();
        hatch.save_asset(asset);
    })
}

function main() {
    const hatch = new libingester.Hatch('hipwee', { argv: process.argv.slice(2) });

    rss2json.load(FEED_RSS, (err, rss) =>
        Promise.all(rss.items.map(item => ingest_article(hatch, item)))
            .then(() => hatch.finish())
    );
}

main();
