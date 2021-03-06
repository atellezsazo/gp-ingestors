'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const rp = require('request-promise');
const rss2json = require('rss-to-json');
const template = require('./template');
const url = require('url');
const URLParse = require('url-parse');

const rss_uri = "http://www.alodita.com/rss.xml";

//Doesn´t support images
const hosts_drop_images = [
    'i1211.photobucket.com',
];

//remove attributes from image
const remove_attrs_img = [
    'border',
    'class',
    'id',
    'src',
];

//Remove elements
const remove_elements = [
    'br + br + br',
    'a[name="more"]',
    'center',
    'iframe',
    'noscript', //any script injection
    'script', //any script injection
    '.instagram-media'
];

function ingest_article_profile(hatch, uri, pubDate, category) {
    return libingester.util.fetch_html(uri).then(($profile) => {
        const base_uri = libingester.util.get_doc_base_uri($profile, uri);
        const asset = new libingester.NewsArticle();
        asset.set_canonical_uri(uri);

        // Pull out the updated date
        const modified_date = $profile('.date-header span').text();
        asset.set_last_modified_date(new Date(Date.parse(modified_date)));
        const date_post = $profile('.date-header').first().text();

        //Set title section
        const title = $profile('meta[property="og:title"]').attr('content');
        asset.set_title(title);
        const article_synopsis = $profile('meta[property="og:description"]').attr('content');
        asset.set_synopsis(article_synopsis);
        asset.set_section('Post');

        const body = $profile('.post-body').first();

        //Download images
        let index = 0;
        body.find('img').map(function() {
            const img_src = this.attribs.src;
            const parent = $profile(this).parent().first();
            const img_url = URLParse(img_src);
            const matches = hosts_drop_images.filter(host => host.includes(img_url.host));
            const article_thumbnail = $profile(this);

            if (img_src != undefined && matches.length == 0) {
                const image = libingester.util.download_img(this, base_uri);
                image.set_title(title);
                hatch.save_asset(image);
                this.attribs["data-libingester-asset-id"] = image.asset_id;
                for (const attr in remove_attrs_img) {
                    delete this.attribs[attr];
                }

                if (parent.name = "a") {
                    parent.before($profile(this)); //Moves image outside the wrap
                }

                if (index == 0) {
                    asset.set_thumbnail(image);
                }
                index++;
            } else {
                $profile(this).remove();
            }

            if (parent.name = "a") {
                parent.remove(); //Delete image wrap
            }
        });

        //remove elements
        for (const remove_element of remove_elements) {
            body.find(remove_element).remove();
        }

        const content = mustache.render(template.structure_template, {
            title: title,
            date_post: date_post,
            body: body.html()
        });

        asset.set_document(content);
        hatch.save_asset(asset);
    });
}

function main() {
    const hatch = new libingester.Hatch();
    rss2json.load(rss_uri, function(err, rss) {
        const post_uris = rss.items.map((datum) => datum.url);
        Promise.all(post_uris.map((uri) => ingest_article_profile(hatch, uri))).then(() => {
            return hatch.finish();
        });
    });
}

main();