'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const rss2json = require('rss-to-json');
const template = require('./template');

const base_uri = 'http://www.khaosodenglish.com/';
const rss_feed = 'http://www.khaosodenglish.com/feed/';

// cleaning elements
const clean_elements = ['a', 'div', 'figure', 'i', 'p', 'span'];

// delete attr (tag)
const remove_attr = ['height', 'itemscope', 'itemprop', 'itemtype',
    'sizes', 'style', 'title', 'width',
];

// remove elements (body)
const remove_elements = ['.td-post-featured-image', '.twitter-tweet',
    '.twitter-video', '.ud-video-wrapper', 'div', 'iframe', 'noscript', 'script',
    'style'
];

function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.NewsArticle();
        const author = $('meta[name="author"]').attr('content');
        const category = $('.entry-crumbs').first();
        const body = $('.td-post-content').first();
        const description = $('meta[property="og:description"]').attr('content');
        const entry_date = $('time.entry-date').first();
        const modified_date = new Date(Date.parse(entry_date.attr('datetime'))); // for asset
        const modified_time = entry_date.text(); // for template
        const section = $('meta[property="article:section"]').attr('content');
        const title = $('meta[property="og:title"]').attr('content');
        const uri_main_image = body.find('.entry-thumb').first().attr('src');
        const uri_image_video = $('meta[property="og:image"]').attr('content');

        // article settings
        asset.set_canonical_uri(uri);
        asset.set_last_modified_date(modified_date);
        asset.set_section(section);
        asset.set_synopsis(description);
        asset.set_title(title);

        // main image or video background
        const main_image = libingester.util.download_image(uri_main_image || uri_image_video);
        main_image.set_title(title);
        asset.set_thumbnail(main_image);
        hatch.save_asset(main_image);

        // remove elements and clean tags
        const clean_attr = (tag, a = remove_attr) => a.forEach((attr) => $(tag).removeAttr(attr));
        const clean_tags = (tags) => tags.get().map((t) => clean_attr(t));
        body.find('#AdAsia').parent().remove();
        body.find(remove_elements.join(',')).remove();
        category.find('img, i, meta').remove();
        clean_tags(body.find(clean_elements.join(',')));
        clean_tags(category.find(clean_elements.join(',')));

        // download images
        body.find('img').get().map((img) => {
            clean_attr(img);
            const image = libingester.util.download_img(img);
            image.set_title(title);
            hatch.save_asset(image);
        });

        const content = mustache.render(template.structure_template, {
            author: author,
            body: body.html(),
            category: category.html(),
            date_published: modified_time,
            main_image: main_image,
            title: title,
        });

        asset.set_document(content);
        hatch.save_asset(asset);
    });
}

function main() {
    const hatch = new libingester.Hatch();
    rss2json.load(rss_feed, (err, rss) => {
        let promises = [];
        rss.items.map((item) => {
            if (!item.url.includes('/crimecourtscalamity/')) { // excluding "crime y legal"
                promises.push(ingest_article(hatch, item.url));
            }
        })
        Promise.all(promises).then(() => {
            return hatch.finish();
        });
    })
}

main();